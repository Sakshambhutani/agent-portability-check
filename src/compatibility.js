import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  defaultCommandCheck,
  evaluateDependencies,
  normalizeMcpServers,
} from './dependencies.js';
import {
  acceptsInstructionOwner,
  harnessDefinition,
  targetKeys,
  visibleOwnersFor,
} from './harnesses.js';

export const TARGETS = Object.fromEntries(
  targetKeys().map(key => [key, harnessDefinition(key)])
);

function resolveDisplayPath(displayPath, { cwd, home }) {
  if (displayPath.startsWith('~/')) return path.join(home, displayPath.slice(2));
  if (displayPath.startsWith('./')) return path.join(cwd, displayPath.slice(2));
  return path.resolve(displayPath);
}

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return { hasFrontmatter: false, name: '', description: '' };
  const yaml = match[1];
  const nameMatch = yaml.match(/^name:\s*["']?([^\n"']+)["']?\s*$/m);
  const descriptionMatch = yaml.match(/^description:\s*(.+)$/m);
  return {
    hasFrontmatter: true,
    name: nameMatch?.[1]?.trim() || '',
    description: descriptionMatch?.[1]?.trim()?.replace(/^["']|["']$/g, '') || '',
  };
}

function referencedLocalPaths(content) {
  const found = new Set();
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const value = match[1].trim().split(/\s+/)[0];
    if (value) found.add(value);
  }
  for (const match of content.matchAll(/\b(?:scripts|references|assets)\/[A-Za-z0-9._/-]+/g)) found.add(match[0]);
  return [...found].filter(value => {
    if (!value || value.startsWith('#')) return false;
    if (/^(?:https?:|mailto:|data:)/i.test(value)) return false;
    if (value.includes('*') || value.includes('<') || value.includes('>')) return false;
    return true;
  });
}

function inspectCopy(copy, context) {
  const skillFile = resolveDisplayPath(copy.path, context);
  const skillDir = path.dirname(skillFile);
  let content = '';
  try { content = fs.readFileSync(skillFile, 'utf8'); } catch {
    return {
      copy, skillFile, skillDir, folderName: path.basename(skillDir),
      frontmatter: { hasFrontmatter: false, name: '', description: '' },
      missingReferences: [], resolvedReferences: [], content: '', unreadable: true,
    };
  }
  const frontmatter = parseFrontmatter(content);
  const missingReferences = [];
  const resolvedReferences = [];
  for (const ref of referencedLocalPaths(content)) {
    const cleanRef = ref.replace(/[),.;:]+$/, '');
    const resolved = path.resolve(skillDir, cleanRef);
    const relative = path.relative(skillDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
    if (!fs.existsSync(resolved)) missingReferences.push(cleanRef);
    else resolvedReferences.push({ relative: cleanRef.replaceAll('\\','/'), absolute: resolved });
  }
  return {
    copy, skillFile, skillDir, folderName: path.basename(skillDir),
    frontmatter, missingReferences, resolvedReferences, content, unreadable: false,
  };
}

function structuralProblems(inspected, target) {
  const problems = [];
  if (inspected.unreadable) return ['SKILL.md could not be read.'];
  if (!inspected.frontmatter.hasFrontmatter) problems.push('SKILL.md is missing YAML frontmatter.');
  if (!inspected.frontmatter.name) problems.push('SKILL.md is missing a frontmatter name.');
  if (!inspected.frontmatter.description) problems.push('SKILL.md is missing a frontmatter description.');
  if (inspected.frontmatter.name && !/^[a-z0-9-]+$/.test(inspected.frontmatter.name)) problems.push('Skill name is not lowercase kebab-case.');
  if (inspected.frontmatter.name.length > 64) problems.push('Skill name exceeds 64 characters.');
  if (inspected.frontmatter.description.length > 1024) problems.push('Skill description exceeds 1024 characters.');
  const targetMeta = harnessDefinition(target);
  if (targetMeta?.requireFolderNameMatch && inspected.frontmatter.name && inspected.frontmatter.name !== inspected.folderName) {
    problems.push(`${targetMeta.label} expects the skill name "${inspected.frontmatter.name}" to match folder "${inspected.folderName}".`);
  }
  if (inspected.missingReferences.length) {
    problems.push(`Missing companion file${inspected.missingReferences.length === 1 ? '' : 's'}: ${inspected.missingReferences.join(', ')}.`);
  }
  return problems;
}

function targetCanSee(copy, target, runtime) {
  const meta = harnessDefinition(target);
  if (!meta) return false;
  if (runtime === 'cloud') {
    return Boolean(
      meta.cloud &&
      copy.scope === 'project' &&
      visibleOwnersFor(target, 'project').has(copy.owner) &&
      copy.packageValid
    );
  }
  return Boolean(visibleOwnersFor(target, copy.scope).has(copy.owner) && copy.packageValid);
}

function chooseInspection(status, target, runtime, context) {
  const inspected = status.copies.map(copy => inspectCopy(copy, context));
  const visible = inspected.filter(item => targetCanSee(item.copy, target, runtime));
  if (visible.length) {
    const clean = visible.find(item => structuralProblems(item, target).length === 0);
    return clean || visible[0];
  }
  const portable = inspected.find(item => item.copy.owner === 'portable');
  return portable || inspected[0];
}

function cloudLocalOnlyReason(status, target) {
  const meta = harnessDefinition(target);
  const projectVisible = status.copies.some(copy =>
    copy.scope === 'project' &&
    visibleOwnersFor(target, 'project').has(copy.owner) &&
    copy.packageValid
  );
  if (projectVisible) return null;

  const globalTargetCopy = status.copies.some(copy =>
    copy.scope === 'global' && visibleOwnersFor(target, 'global').has(copy.owner)
  );
  if (globalTargetCopy) {
    return `This skill is available only in a user-level local directory. Local presence does not prove ${meta?.cloudLabel || meta?.label || target} receives it; put the skill in the repository.`;
  }

  const globalOther = status.copies.some(copy => copy.scope === 'global');
  if (globalOther) {
    return `This skill exists only in a user-level local directory. Put it in the repository before relying on ${meta?.cloudLabel || meta?.label || target}.`;
  }
  return null;
}

function buildContextRisks(report, target, runtime) {
  const risks = [];
  const meta = harnessDefinition(target);
  const targetLabel = runtime === 'cloud' ? (meta?.cloudLabel || `${meta?.label || target} Cloud`) : (meta?.label || target);

  for (const instruction of report.instructions || []) {
    if (runtime === 'cloud' && instruction.scope === 'global') {
      risks.push({
        kind: 'instruction',
        severity: 'manual',
        path: instruction.path,
        reason: `Global instruction files on this machine are not part of the repository used by ${targetLabel}.`,
      });
      continue;
    }

    if (!acceptsInstructionOwner(target, instruction.owner)) {
      let reason = `${targetLabel} does not consume this instruction source as its native/default instruction format.`;
      if (target === 'claude' && instruction.owner === 'shared') {
        reason = 'AGENTS.md instructions are not automatically loaded as Claude Code CLAUDE.md memory.';
      } else if (target === 'gemini' && instruction.owner === 'shared') {
        reason = 'Gemini CLI uses GEMINI.md by default; AGENTS.md is only used if the context filename is explicitly configured.';
      } else if (target === 'copilot' && ['claude','gemini'].includes(instruction.owner)) {
        reason = 'Some GitHub Copilot surfaces can consume CLAUDE.md/GEMINI.md, but support is not uniform across Copilot surfaces; use AGENTS.md or Copilot instructions for a portable default.';
      }
      risks.push({ kind: 'instruction', severity: 'manual', path: instruction.path, reason });
    }
  }

  for (const rule of report.rules || report.cursorRules || []) {
    if (runtime === 'cloud' && rule.scope === 'global') {
      risks.push({
        kind: rule.kind || 'rule',
        severity: 'manual',
        path: rule.path,
        reason: `Global ${rule.owner} rules on this machine are not part of the repository used by ${targetLabel}.`,
      });
      continue;
    }
    if (rule.owner !== target) {
      risks.push({
        kind: rule.kind || 'rule',
        severity: 'manual',
        path: rule.path,
        reason: `${targetLabel} does not consume ${rule.owner}-specific rule files as its native/default rule format.`,
      });
    }
  }
  return risks;
}

function skillScopes(report) {
  return [
    ['global', report.global?.statuses || []],
    ['project', report.project?.statuses || []],
  ];
}

export function analyzeTargetCompatibility(report, target, {
  cwd = report.cwd || process.cwd(),
  home = os.homedir(),
  runtime = 'local',
  env = process.env,
  commandCheck = defaultCommandCheck,
  mcpServers = null,
} = {}) {
  if (!TARGETS[target]) throw new Error(`Unsupported target "${target}". Use ${targetKeys().join(', ')}.`);
  if (!['local','cloud'].includes(runtime)) throw new Error('Unsupported runtime. Use local or cloud.');
  const selectedMeta = harnessDefinition(target);
  if (runtime === 'cloud' && !selectedMeta?.cloud) {
    throw new Error(`Cloud runtime checks are not supported for ${selectedMeta?.label || target}.`);
  }

  const context = { cwd: path.resolve(cwd), home: path.resolve(home) };
  const targetMeta = harnessDefinition(target);
  const resolvedMcpServers = normalizeMcpServers(mcpServers, context);
  const skills = [];
  const localOnlyRisks = [];

  for (const [scope, statuses] of skillScopes(report)) {
    for (const status of statuses) {
      if (status.drifted) {
        skills.push({ name: status.name, scope, status: 'manual', reason: 'Same-name copies have different contents. Pick a canonical version before migrating.', fix: null, dependencies: { commands: [], environment: [], mcpServers: [], blockers: [] } });
        continue;
      }

      const inspection = chooseInspection(status, target, runtime, context);
      if (!inspection) continue;
      const problems = structuralProblems(inspection, target);
      if (problems.length) {
        skills.push({ name: status.name, scope, status: 'manual', reason: problems.join(' '), fix: null, dependencies: { commands: [], environment: [], mcpServers: [], blockers: [] } });
        continue;
      }

      if (runtime === 'cloud') {
        const localReason = cloudLocalOnlyReason(status, target);
        if (localReason) {
          localOnlyRisks.push({ name: status.name, scope, reason: localReason });
          const dependencies = evaluateDependencies({ content: inspection.content, resolvedReferences: inspection.resolvedReferences, target, runtime, env, commandCheck, mcpServers: resolvedMcpServers });
          skills.push({ name: status.name, scope, status: 'manual', reason: [localReason, ...dependencies.blockers].join(' '), fix: null, dependencies });
          continue;
        }
      }

      const visible = status.copies.some(copy => targetCanSee(copy, target, runtime));
      const baseStatus = visible ? 'ready' : 'auto-fix';
      const baseReason = visible
        ? `${runtime === 'cloud' ? (targetMeta.cloudLabel || `${targetMeta.label} Cloud`) : targetMeta.label} can discover this structurally valid skill package.`
        : `The skill package is valid, but ${targetMeta.label} cannot discover it from its current location.`;
      const fix = visible ? null : targetMeta.fix;
      const dependencies = evaluateDependencies({ content: inspection.content, resolvedReferences: inspection.resolvedReferences, target, runtime, env, commandCheck, mcpServers: resolvedMcpServers });

      if (dependencies.blockers.length) skills.push({ name: status.name, scope, status: 'manual', reason: [baseReason, ...dependencies.blockers].join(' '), fix, dependencies });
      else skills.push({ name: status.name, scope, status: baseStatus, reason: baseReason, fix, dependencies });
    }
  }

  skills.sort((a,b) => {
    const order = { manual: 0, 'auto-fix': 1, ready: 2 };
    return order[a.status] - order[b.status] || a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name);
  });

  const summary = {
    total: skills.length,
    ready: skills.filter(skill => skill.status === 'ready').length,
    autoFix: skills.filter(skill => skill.status === 'auto-fix').length,
    manual: skills.filter(skill => skill.status === 'manual').length,
  };
  const contextRisks = buildContextRisks(report, target, runtime);
  const dependencyRiskCount = skills.reduce((sum, skill) => sum + (skill.dependencies?.blockers?.length || 0), 0);
  const targetInstalled = report.installedHarnesses.some(item => item.key === target);
  const targetLabel = runtime === 'cloud'
    ? (targetMeta.cloudLabel || `${targetMeta.label} Cloud`)
    : targetMeta.label;
  const skillPackagesReady = Boolean(
    summary.total > 0 &&
    summary.ready === summary.total &&
    summary.autoFix === 0 &&
    summary.manual === 0
  );
  const fullyReady = Boolean(skillPackagesReady && contextRisks.length === 0);

  return {
    target, targetLabel, runtime, targetInstalled, summary, skills, contextRisks, localOnlyRisks,
    dependencyRiskCount, skillPackagesReady, fullyReady,
    readyPercent: summary.total > 0 ? Math.round(100 * summary.ready / summary.total) : null,
  };
}

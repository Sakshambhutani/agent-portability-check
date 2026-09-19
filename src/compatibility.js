import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  defaultCommandCheck,
  evaluateDependencies,
  normalizeMcpServers,
} from './dependencies.js';

export const TARGETS = {
  codex: {
    label: 'Codex',
    visibleOwners: new Set(['portable']),
    fix: 'Move the canonical skill package to ~/.agents/skills.',
  },
  claude: {
    label: 'Claude Code',
    visibleOwners: new Set(['claude']),
    fix: 'Add a Claude-discoverable adapter in ~/.claude/skills.',
  },
  cursor: {
    label: 'Cursor',
    visibleOwners: new Set(['portable','cursor','claude','codex']),
    fix: 'Move the canonical skill package to a Cursor-compatible skill location.',
  },
};

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
  if (target === 'cursor' && inspected.frontmatter.name && inspected.frontmatter.name !== inspected.folderName) {
    problems.push(`Cursor expects the skill name "${inspected.frontmatter.name}" to match folder "${inspected.folderName}".`);
  }
  if (inspected.missingReferences.length) {
    problems.push(`Missing companion file${inspected.missingReferences.length === 1 ? '' : 's'}: ${inspected.missingReferences.join(', ')}.`);
  }
  return problems;
}

function targetCanSee(copy, target, runtime) {
  if (target === 'cursor' && runtime === 'cloud') {
    return copy.scope === 'project' && ['portable','cursor','claude','codex'].includes(copy.owner) && copy.packageValid;
  }
  const meta = TARGETS[target];
  return Boolean(meta && meta.visibleOwners.has(copy.owner) && copy.packageValid);
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

function cloudLocalOnlyReason(status) {
  const projectVisible = status.copies.some(copy => copy.scope === 'project' && ['portable','cursor','claude','codex'].includes(copy.owner) && copy.packageValid);
  if (projectVisible) return null;
  const globalCursor = status.copies.some(copy => copy.scope === 'global' && copy.owner === 'cursor');
  if (globalCursor) return 'This is a user-level Cursor skill. Local presence alone does not prove Cursor Cloud receives it; enable cloud skill sync or move it into the repository.';
  const globalOther = status.copies.some(copy => copy.scope === 'global');
  if (globalOther) return 'This skill exists only in a user-level local directory. Put it in the repository or explicitly sync a Cursor user-level copy before relying on Cursor Cloud.';
  return null;
}

function buildContextRisks(report, target, runtime) {
  const risks = [];
  for (const instruction of report.instructions || []) {
    let reason = '';
    if (target === 'codex' && instruction.owner === 'claude') reason = 'Claude-specific instructions are not automatically part of Codex AGENTS.md instruction discovery.';
    if (target === 'claude' && (instruction.owner === 'shared' || instruction.owner === 'codex')) reason = 'AGENTS.md/Codex-specific instructions are not automatically loaded as Claude Code CLAUDE.md memory.';
    if (target === 'cursor' && runtime === 'cloud' && instruction.scope === 'global') reason = 'Global instruction files on this machine are not part of the cloned Cursor Cloud repository.';
    if (reason) risks.push({ kind: 'instruction', severity: 'manual', path: instruction.path, reason });
  }
  for (const rule of report.cursorRules || []) {
    if (target !== 'cursor') risks.push({ kind: 'cursor-rule', severity: 'manual', path: rule.path, reason: `${TARGETS[target].label} does not consume Cursor .cursor/rules as its native instruction format.` });
    else if (runtime === 'cloud' && rule.scope === 'global') risks.push({ kind: 'cursor-rule', severity: 'manual', path: rule.path, reason: 'Global Cursor rules are local to this machine and are not part of the cloud repository.' });
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
  if (!TARGETS[target]) throw new Error(`Unsupported target "${target}". Use claude, codex, or cursor.`);
  if (!['local','cloud'].includes(runtime)) throw new Error('Unsupported runtime. Use local or cloud.');
  if (runtime === 'cloud' && target !== 'cursor') throw new Error('Cloud runtime checks are currently supported only for Cursor.');

  const context = { cwd: path.resolve(cwd), home: path.resolve(home) };
  const targetMeta = TARGETS[target];
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

      if (target === 'cursor' && runtime === 'cloud') {
        const localReason = cloudLocalOnlyReason(status);
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
        ? `${runtime === 'cloud' ? 'Cursor Cloud' : targetMeta.label} can discover this structurally valid skill package.`
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
  const targetLabel = target === 'cursor' && runtime === 'cloud' ? 'Cursor Cloud' : targetMeta.label;
  const fullyReady = Boolean(summary.total > 0 && summary.ready === summary.total && summary.autoFix === 0 && summary.manual === 0 && contextRisks.length === 0);

  return {
    target, targetLabel, runtime, targetInstalled, summary, skills, contextRisks, localOnlyRisks, dependencyRiskCount, fullyReady,
    readyPercent: summary.total > 0 ? Math.round(100 * summary.ready / summary.total) : null,
  };
}

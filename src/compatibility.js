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

function cleanReferenceTarget(value) {
  let clean = String(value || '').trim().split(/\s+/)[0];
  if (!clean || clean.startsWith('#')) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/i.test(clean)) return null;
  if (clean.includes('*') || clean.includes('<') || clean.includes('>')) return null;
  clean = clean.split('#')[0].split('?')[0].replace(/[),.;:]+$/, '');
  if (!clean) return null;
  try { clean = decodeURIComponent(clean); } catch {}
  return clean;
}

function referencedLocalPaths(content) {
  const found = new Set();
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const value = cleanReferenceTarget(match[1]);
    if (value) found.add(value);
  }
  for (const match of content.matchAll(/(?<![A-Za-z0-9_}\/(?:scripts|references|assets)\/[A-Za-z0-9._/-]+(?:#[A-Za-z0-9._:-]+)?/g)) {
    const value = cleanReferenceTarget(match[0]);
    if (value) found.add(value);
  }
  for (const match of content.matchAll(/\$\{?(?:CLAUDE_PLUGIN_ROOT|CODEX_PLUGIN_ROOT)\}?\/[A-Za-z0-9._/-]+/g)) {
    found.add(match[0]);
  }
  return [...found];
}

function resolveSkillReference(ref, { skillDir, pluginRoot = null }) {
  const pluginRootMatch = ref.match(/^\$\{?(?:CLAUDE_PLUGIN_ROOT|CODEX_PLUGIN_ROOT)\}?\/(.+)$/);
  if (pluginRootMatch) {
    if (!pluginRoot) return { resolved: null, external: true, unresolvedPluginRoot: true };
    return { resolved: path.resolve(pluginRoot, pluginRootMatch[1]), external: true, unresolvedPluginRoot: false };
  }

  const resolved = path.resolve(skillDir, ref);
  const relativeToSkill = path.relative(skillDir, resolved);
  const insideSkill = !relativeToSkill.startsWith('..') && !path.isAbsolute(relativeToSkill);
  if (insideSkill) return { resolved, external: false, unresolvedPluginRoot: false };

  if (pluginRoot) {
    const relativeToPlugin = path.relative(pluginRoot, resolved);
    const insidePlugin = !relativeToPlugin.startsWith('..') && !path.isAbsolute(relativeToPlugin);
    if (insidePlugin) return { resolved, external: true, unresolvedPluginRoot: false };
  }

  return { resolved: null, external: true, unresolvedPluginRoot: false };
}

function inspectCopy(copy, context) {
  const skillFile = resolveDisplayPath(copy.path, context);
  const skillDir = path.dirname(skillFile);
  const pluginRoot = copy.pluginRoot ? resolveDisplayPath(copy.pluginRoot, context) : null;
  let content = '';
  try { content = fs.readFileSync(skillFile, 'utf8'); } catch {
    return {
      copy, skillFile, skillDir, pluginRoot, folderName: path.basename(skillDir),
      frontmatter: { hasFrontmatter: false, name: '', description: '' },
      missingReferences: [], externalReferences: [], resolvedReferences: [], content: '', unreadable: true,
    };
  }
  const frontmatter = parseFrontmatter(content);
  const missingReferences = [];
  const externalReferences = [];
  const resolvedReferences = [];

  for (const ref of referencedLocalPaths(content)) {
    const resolution = resolveSkillReference(ref, { skillDir, pluginRoot });
    if (!resolution.resolved) {
      if (resolution.unresolvedPluginRoot) externalReferences.push(ref);
      continue;
    }
    if (!fs.existsSync(resolution.resolved)) {
      missingReferences.push(ref);
      continue;
    }
    resolvedReferences.push({
      relative: ref.replaceAll('\\','/'),
      absolute: resolution.resolved,
      external: resolution.external,
    });
    if (resolution.external) externalReferences.push(ref);
  }

  return {
    copy, skillFile, skillDir, pluginRoot, folderName: path.basename(skillDir),
    frontmatter, missingReferences, externalReferences, resolvedReferences, content, unreadable: false,
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
  if (inspected.externalReferences?.length && inspected.copy?.pluginHost !== target) {
    problems.push(
      `Depends on plugin-root companion file${inspected.externalReferences.length === 1 ? '' : 's'} that will not move with the skill directory: ${inspected.externalReferences.join(', ')}.`
    );
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
  return Boolean(
    copy.packageValid &&
    (copy.pluginHost === target || visibleOwnersFor(target, copy.scope).has(copy.owner))
  );
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

function readinessEvidence({
  discoverable = null,
  packageComplete = null,
  dependenciesAvailable = null,
  versionConsistent = true,
} = {}) {
  return {
    discoverable,
    packageComplete,
    dependenciesAvailable,
    versionConsistent,
    authentication: 'not-tested',
    execution: 'not-tested',
  };
}

function sourceEvidence(copy) {
  return {
    type: copy?.sourceType || 'skill-root',
    owner: copy?.owner || null,
    pluginHost: copy?.pluginHost || null,
    pluginId: copy?.pluginId || null,
  };
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
        skills.push({
          name: status.name,
          scope,
          status: 'manual',
          reason: 'Same-name copies have different contents. Pick a canonical version before migrating.',
          fix: null,
          source: sourceEvidence(status.copies[0]),
          readiness: readinessEvidence({ versionConsistent: false }),
          dependencies: { commands: [], environment: [], mcpServers: [], blockers: [] },
        });
        continue;
      }

      const inspection = chooseInspection(status, target, runtime, context);
      if (!inspection) continue;
      const problems = structuralProblems(inspection, target);
      if (problems.length) {
        skills.push({
          name: status.name,
          scope,
          status: 'manual',
          reason: problems.join(' '),
          fix: null,
          source: sourceEvidence(inspection.copy),
          readiness: readinessEvidence({
            discoverable: status.copies.some(copy => targetCanSee(copy, target, runtime)),
            packageComplete: false,
            dependenciesAvailable: null,
          }),
          dependencies: { commands: [], environment: [], mcpServers: [], blockers: [] },
        });
        continue;
      }

      if (runtime === 'cloud') {
        const localReason = cloudLocalOnlyReason(status, target);
        if (localReason) {
          localOnlyRisks.push({ name: status.name, scope, reason: localReason });
          const dependencies = evaluateDependencies({ content: inspection.content, resolvedReferences: inspection.resolvedReferences, target, runtime, env, commandCheck, mcpServers: resolvedMcpServers });
          skills.push({
            name: status.name,
            scope,
            status: 'manual',
            reason: [localReason, ...dependencies.blockers].join(' '),
            fix: null,
            source: sourceEvidence(inspection.copy),
            readiness: readinessEvidence({
              discoverable: false,
              packageComplete: true,
              dependenciesAvailable: dependencies.blockers.length === 0,
            }),
            dependencies,
          });
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

      const readiness = readinessEvidence({
        discoverable: visible,
        packageComplete: true,
        dependenciesAvailable: dependencies.blockers.length === 0,
      });
      const item = {
        name: status.name,
        scope,
        source: sourceEvidence(inspection.copy),
        readiness,
        dependencies,
        fix,
      };
      if (dependencies.blockers.length) {
        skills.push({ ...item, status: 'manual', reason: [baseReason, ...dependencies.blockers].join(' ') });
      } else {
        skills.push({ ...item, status: baseStatus, reason: baseReason });
      }
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
    dimensions: {
      discoverable: skills.filter(skill => skill.readiness?.discoverable === true).length,
      packageComplete: skills.filter(skill => skill.readiness?.packageComplete === true).length,
      dependenciesAvailable: skills.filter(skill => skill.readiness?.dependenciesAvailable === true).length,
      authenticationTested: skills.filter(skill => skill.readiness?.authentication === 'tested').length,
      executionTested: skills.filter(skill => skill.readiness?.execution === 'tested').length,
    },
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


export function allTargetDescriptors({ includeCloud = true } = {}) {
  const targets = targetKeys().map(target => ({ target, runtime: 'local' }));
  if (includeCloud) {
    for (const target of targetKeys()) {
      if (harnessDefinition(target)?.cloud) targets.push({ target, runtime: 'cloud' });
    }
  }
  return targets;
}

export function analyzeAllCompatibility(report, {
  cwd = report.cwd || process.cwd(),
  home = os.homedir(),
  env = process.env,
  commandCheck = defaultCommandCheck,
  mcpServers = null,
  includeCloud = true,
} = {}) {
  const results = allTargetDescriptors({ includeCloud }).map(({ target, runtime }) =>
    analyzeTargetCompatibility(report, target, {
      cwd,
      home,
      runtime,
      env,
      commandCheck,
      mcpServers,
    })
  );

  const skillKeys = new Set();
  for (const result of results) {
    for (const skill of result.skills) skillKeys.add(`${skill.scope || 'global'}:${skill.name}`);
  }

  const matrix = [...skillKeys].sort().map(key => {
    const [scope, ...nameParts] = key.split(':');
    const name = nameParts.join(':');
    const cells = {};
    for (const result of results) {
      const id = result.runtime === 'cloud' ? `${result.target}-cloud` : result.target;
      const skill = result.skills.find(item => (item.scope || 'global') === scope && item.name === name);
      cells[id] = skill
        ? {
            status: skill.status,
            reason: skill.reason,
            dependencyBlockers: skill.dependencies?.blockers?.length || 0,
          }
        : { status: 'not-found', reason: 'Skill was not present in this scan.', dependencyBlockers: 0 };
    }
    return { scope, name, targets: cells };
  });

  const summary = {
    targets: results.length,
    targetsReady: results.filter(result => result.skillPackagesReady).length,
    targetsFullyReady: results.filter(result => result.fullyReady).length,
    totalSkills: matrix.length,
    allSkillPackagesReady: Boolean(results.length && results.every(result => result.skillPackagesReady)),
    allFullyReady: Boolean(results.length && results.every(result => result.fullyReady)),
    autoFixTargets: results.filter(result => result.summary.autoFix > 0).length,
    manualTargets: results.filter(result => result.summary.manual > 0).length,
    contextGapTargets: results.filter(result => result.contextRisks.length > 0).length,
  };

  return {
    mode: 'all',
    includeCloud,
    targets: results,
    matrix,
    summary,
  };
}

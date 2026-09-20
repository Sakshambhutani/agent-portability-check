import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { harnessDefinition } from './harnesses.js';

function resolveDisplayPath(displayPath, { cwd, home }) {
  if (displayPath.startsWith('~/')) return path.join(home, displayPath.slice(2));
  if (displayPath.startsWith('./')) return path.join(cwd, displayPath.slice(2));
  return path.resolve(displayPath);
}

function sourceSkillDir(copy, context) {
  return path.dirname(resolveDisplayPath(copy.path, context));
}

function folderNameForCopy(copy, context) {
  return path.basename(sourceSkillDir(copy, context));
}

function packageIssueReason(copy) {
  const issues = [];
  if (!copy?.hasFrontmatter) {
    issues.push('SKILL.md is missing YAML frontmatter.');
  } else {
    if (!copy.frontmatterName) issues.push('SKILL.md is missing a frontmatter name.');
    else if (!/^[a-z0-9-]+$/.test(copy.frontmatterName)) issues.push('Skill name is not lowercase kebab-case.');
    if (!copy.hasDescription) issues.push('SKILL.md is missing a frontmatter description.');
    if (copy.folderMatchesName === false) {
      issues.push(`Skill name "${copy.frontmatterName}" does not match folder "${copy.folderName}".`);
    }
  }
  if (copy?.missingReferences?.length) {
    issues.push(`Missing companion file${copy.missingReferences.length === 1 ? '' : 's'}: ${copy.missingReferences.join(', ')}.`);
  }
  if (!issues.length) issues.push('Skill metadata or companion files are invalid.');
  return `${issues.join(' ')}${copy?.path ? ` Source: ${copy.path}.` : ''}`;
}

function scopeRoots(scope, { cwd, home }) {
  const base = scope === 'project' ? cwd : home;
  return {
    base,
    portableRoot: path.join(base, '.agents', 'skills'),
  };
}

function adapterRootFor(target, scope, context) {
  const meta = harnessDefinition(target);
  if (!meta?.needsPortableAdapter || !meta.adapterRoot) return null;
  const base = scope === 'project' ? context.cwd : context.home;
  return path.join(base, meta.adapterRoot);
}

export function planPortableReadyFix(report, {
  home = os.homedir(),
  cwd = report.cwd || process.cwd(),
  target = null,
  targets = [],
  blockedSkillNames = [],
  blockedSkillKeys = [],
} = {}) {
  const context = { cwd, home };
  const installed = new Set(report.installedHarnesses.map(h => h.key));
  if (target) installed.add(target);
  for (const item of targets || []) installed.add(item);
  const blockedNames = new Set(blockedSkillNames);
  const blockedKeys = new Set(blockedSkillKeys);
  const copyPlans = [];
  const adapterPlans = [];
  const conflicts = [];
  const alreadyReady = [];

  const processScope = (scope, statuses) => {
    const roots = scopeRoots(scope, context);

    for (const status of statuses) {
      const skillKey = `${scope}:${status.name}`;
      if (blockedKeys.has(skillKey) || blockedNames.has(status.name)) {
        conflicts.push({
          name: status.name,
          scope,
          reason: 'Compatibility check found a dependency, context, or structural issue that requires manual attention.',
        });
        continue;
      }

      if (status.drifted) {
        conflicts.push({ name: status.name, scope, reason: 'Same-name copies differ. Choose the canonical version manually before fixing.' });
        continue;
      }

      const portableCopy = status.copies.find(copy => copy.owner === 'portable');
      if (portableCopy && !portableCopy.packageValid) {
        conflicts.push({ name: status.name, scope, reason: `Shared copy is not portable-ready. ${packageIssueReason(portableCopy)} Fix it manually first.` });
        continue;
      }

      let canonicalDir = portableCopy ? sourceSkillDir(portableCopy, context) : null;

      if (!portableCopy) {
        const source = status.copies.find(copy => copy.packageValid) || status.copies[0];
        if (!source) continue;
        if (!source.packageValid) {
          conflicts.push({ name: status.name, scope, reason: `${packageIssueReason(source)} Nothing was copied.` });
          continue;
        }

        const sourceDir = sourceSkillDir(source, context);
        const folderName = folderNameForCopy(source, context);
        const targetDir = path.join(roots.portableRoot, folderName);

        if (fs.existsSync(targetDir)) {
          conflicts.push({ name: status.name, scope, reason: `Target already exists at ${targetDir}. Nothing was overwritten.` });
          continue;
        }

        copyPlans.push({ name: status.name, scope, sourceDir, targetDir, sourceOwner: source.owner });
        canonicalDir = targetDir;
      } else {
        alreadyReady.push({ name: status.name, scope });
      }

      for (const adapterTarget of installed) {
        const meta = harnessDefinition(adapterTarget);
        if (!meta?.needsPortableAdapter || !canonicalDir) continue;
        if (status.copies.some(copy => copy.owner === adapterTarget)) continue;
        const adapterRoot = adapterRootFor(adapterTarget, scope, context);
        if (!adapterRoot) continue;
        const linkPath = path.join(adapterRoot, path.basename(canonicalDir));
        if (!fs.existsSync(linkPath)) {
          adapterPlans.push({
            name: status.name,
            scope,
            target: adapterTarget,
            label: meta.label,
            kind: 'discovery-symlink',
            targetDir: canonicalDir,
            linkPath,
          });
        }
      }
    }
  };

  processScope('global', report.global?.statuses || []);
  processScope('project', report.project?.statuses || []);

  return {
    copyPlans,
    adapterPlans,
    conflicts,
    alreadyReady,
    changeCount: copyPlans.length + adapterPlans.length,
  };
}

export function applyPortableReadyFix(plan) {
  const applied = [];
  const skipped = [];

  for (const item of plan.copyPlans) {
    fs.mkdirSync(path.dirname(item.targetDir), { recursive: true });
    if (fs.existsSync(item.targetDir)) {
      skipped.push({ ...item, reason: 'target_exists' });
      continue;
    }
    fs.cpSync(item.sourceDir, item.targetDir, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
    applied.push({ ...item, action: 'copied_to_shared_root' });
  }

  for (const item of plan.adapterPlans) {
    fs.mkdirSync(path.dirname(item.linkPath), { recursive: true });
    if (fs.existsSync(item.linkPath)) {
      skipped.push({ ...item, reason: 'adapter_exists' });
      continue;
    }
    fs.symlinkSync(item.targetDir, item.linkPath, 'dir');
    applied.push({ ...item, action: 'created_discovery_adapter' });
  }

  return { applied, skipped };
}

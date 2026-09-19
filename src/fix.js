import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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

export function planPortableReadyFix(report, {
  home = os.homedir(),
  cwd = report.cwd || process.cwd(),
  target = null,
  blockedSkillNames = [],
} = {}) {
  const targetRoot = path.join(home, '.agents', 'skills');
  const installed = new Set(report.installedHarnesses.map(h => h.key));
  if (target) installed.add(target);
  const blocked = new Set(blockedSkillNames);
  const copyPlans = [];
  const adapterPlans = [];
  const conflicts = [];
  const alreadyReady = [];

  for (const status of report.global.statuses) {
    if (blocked.has(status.name)) {
      conflicts.push({
        name: status.name,
        reason: 'Compatibility check found a structural issue that requires manual attention.',
      });
      continue;
    }

    if (status.drifted) {
      conflicts.push({
        name: status.name,
        reason: 'Same-name copies differ. Choose the canonical version manually before fixing.',
      });
      continue;
    }

    const portableCopy = status.copies.find(copy => copy.owner === 'portable');
    if (portableCopy && !portableCopy.packageValid) {
      conflicts.push({
        name: status.name,
        reason: 'Shared copy has invalid skill metadata or missing companion files. Fix it manually first.',
      });
      continue;
    }

    let canonicalDir = portableCopy ? sourceSkillDir(portableCopy, { cwd, home }) : null;

    if (!portableCopy) {
      const source = status.copies.find(copy => copy.packageValid) || status.copies[0];
      if (!source) continue;

      if (!source.packageValid) {
        conflicts.push({
          name: status.name,
          reason: 'Skill metadata or companion files are invalid. Nothing was copied.',
        });
        continue;
      }

      const sourceDir = sourceSkillDir(source, { cwd, home });
      const folderName = folderNameForCopy(source, { cwd, home });
      const targetDir = path.join(targetRoot, folderName);

      if (fs.existsSync(targetDir)) {
        conflicts.push({
          name: status.name,
          reason: `Target already exists at ${targetDir}. Nothing was overwritten.`,
        });
        continue;
      }

      copyPlans.push({
        name: status.name,
        sourceDir,
        targetDir,
        sourceOwner: source.owner,
      });
      canonicalDir = targetDir;
    } else {
      alreadyReady.push(status.name);
    }

    // Claude Code discovers personal skills in ~/.claude/skills, not ~/.agents/skills.
    // If Claude is installed and there is no Claude copy, add an individual symlink adapter.
    if (installed.has('claude') && !status.copies.some(copy => copy.owner === 'claude') && canonicalDir) {
      const folderName = path.basename(canonicalDir);
      const claudeRoot = path.join(home, '.claude', 'skills');
      const linkPath = path.join(claudeRoot, folderName);

      if (!fs.existsSync(linkPath)) {
        adapterPlans.push({
          name: status.name,
          kind: 'claude-symlink',
          targetDir: canonicalDir,
          linkPath,
        });
      }
    }
  }

  return {
    targetRoot,
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

  fs.mkdirSync(plan.targetRoot, { recursive: true });

  for (const item of plan.copyPlans) {
    if (fs.existsSync(item.targetDir)) {
      skipped.push({ ...item, reason: 'target_exists' });
      continue;
    }

    fs.cpSync(item.sourceDir, item.targetDir, {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    });
    applied.push({ ...item, action: 'copied_to_shared_root' });
  }

  for (const item of plan.adapterPlans) {
    fs.mkdirSync(path.dirname(item.linkPath), { recursive: true });

    if (fs.existsSync(item.linkPath)) {
      skipped.push({ ...item, reason: 'adapter_exists' });
      continue;
    }

    fs.symlinkSync(item.targetDir, item.linkPath, 'dir');
    applied.push({ ...item, action: 'created_claude_adapter' });
  }

  return { applied, skipped };
}

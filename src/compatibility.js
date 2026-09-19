import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
    visibleOwners: new Set(['portable', 'cursor', 'claude', 'codex']),
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

  for (const match of content.matchAll(/\b(?:scripts|references|assets)\/[A-Za-z0-9._/-]+/g)) {
    found.add(match[0]);
  }

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

  try {
    content = fs.readFileSync(skillFile, 'utf8');
  } catch {
    return {
      copy,
      skillFile,
      skillDir,
      folderName: path.basename(skillDir),
      frontmatter: { hasFrontmatter: false, name: '', description: '' },
      missingReferences: [],
      unreadable: true,
    };
  }

  const frontmatter = parseFrontmatter(content);
  const missingReferences = [];

  for (const ref of referencedLocalPaths(content)) {
    const cleanRef = ref.replace(/[),.;:]+$/, '');
    const resolved = path.resolve(skillDir, cleanRef);
    const relative = path.relative(skillDir, resolved);

    // Only validate files that are actually part of the skill package.
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
    if (!fs.existsSync(resolved)) missingReferences.push(cleanRef);
  }

  return {
    copy,
    skillFile,
    skillDir,
    folderName: path.basename(skillDir),
    frontmatter,
    missingReferences,
    unreadable: false,
  };
}

function structuralProblems(inspected, target) {
  const problems = [];

  if (inspected.unreadable) {
    problems.push('SKILL.md could not be read.');
    return problems;
  }

  if (!inspected.frontmatter.hasFrontmatter) {
    problems.push('SKILL.md is missing YAML frontmatter.');
  }
  if (!inspected.frontmatter.name) {
    problems.push('SKILL.md is missing a frontmatter name.');
  }
  if (!inspected.frontmatter.description) {
    problems.push('SKILL.md is missing a frontmatter description.');
  }
  if (
    inspected.frontmatter.name &&
    !/^[a-z0-9-]+$/.test(inspected.frontmatter.name)
  ) {
    problems.push('Skill name is not lowercase kebab-case.');
  }
  if (
    target === 'cursor' &&
    inspected.frontmatter.name &&
    inspected.frontmatter.name !== inspected.folderName
  ) {
    problems.push(
      `Cursor expects the skill name "${inspected.frontmatter.name}" to match folder "${inspected.folderName}".`
    );
  }
  if (inspected.missingReferences.length) {
    problems.push(
      `Missing companion file${inspected.missingReferences.length === 1 ? '' : 's'}: ${inspected.missingReferences.join(', ')}.`
    );
  }

  return problems;
}

function targetCanSee(copy, target) {
  const meta = TARGETS[target];
  return Boolean(meta && meta.visibleOwners.has(copy.owner));
}

function chooseInspection(status, target, context) {
  const inspected = status.copies.map(copy => inspectCopy(copy, context));
  const visible = inspected.filter(item => targetCanSee(item.copy, target));

  if (visible.length) {
    const clean = visible.find(item => structuralProblems(item, target).length === 0);
    return clean || visible[0];
  }

  const portable = inspected.find(item => item.copy.owner === 'portable');
  return portable || inspected[0];
}

export function analyzeTargetCompatibility(
  report,
  target,
  { cwd = report.cwd || process.cwd(), home = os.homedir() } = {},
) {
  if (!TARGETS[target]) {
    throw new Error(`Unsupported target "${target}". Use claude, codex, or cursor.`);
  }

  const context = { cwd: path.resolve(cwd), home: path.resolve(home) };
  const targetMeta = TARGETS[target];
  const skills = [];

  for (const status of report.global.statuses) {
    if (status.drifted) {
      skills.push({
        name: status.name,
        status: 'manual',
        reason: 'Same-name copies have different contents. Pick a canonical version before migrating.',
        fix: null,
      });
      continue;
    }

    const inspection = chooseInspection(status, target, context);
    if (!inspection) continue;

    const problems = structuralProblems(inspection, target);
    if (problems.length) {
      skills.push({
        name: status.name,
        status: 'manual',
        reason: problems.join(' '),
        fix: null,
      });
      continue;
    }

    const visible = status.copies.some(copy => targetCanSee(copy, target));

    if (visible) {
      skills.push({
        name: status.name,
        status: 'ready',
        reason: `${targetMeta.label} can already discover this valid skill package.`,
        fix: null,
      });
    } else {
      skills.push({
        name: status.name,
        status: 'auto-fix',
        reason: `The skill package is valid, but ${targetMeta.label} cannot discover it from its current location.`,
        fix: targetMeta.fix,
      });
    }
  }

  skills.sort((a, b) => {
    const order = { manual: 0, 'auto-fix': 1, ready: 2 };
    return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
  });

  const summary = {
    total: skills.length,
    ready: skills.filter(skill => skill.status === 'ready').length,
    autoFix: skills.filter(skill => skill.status === 'auto-fix').length,
    manual: skills.filter(skill => skill.status === 'manual').length,
  };

  const targetInstalled = report.installedHarnesses.some(item => item.key === target);

  return {
    target,
    targetLabel: targetMeta.label,
    targetInstalled,
    summary,
    skills,
    readyPercent: summary.total > 0
      ? Math.round(100 * summary.ready / summary.total)
      : null,
  };
}

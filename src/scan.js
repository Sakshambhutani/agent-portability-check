import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const HARNESS_META = {
  codex: {
    label: 'Codex',
    commands: ['codex'],
    vscodeExtensions: ['openai.chatgpt'],
  },
  claude: {
    label: 'Claude Code',
    commands: ['claude'],
    vscodeExtensions: ['anthropic.claude-code'],
  },
  cursor: {
    label: 'Cursor',
    commands: ['agent', 'cursor'],
    macApps: ['/Applications/Cursor.app', '~/Applications/Cursor.app'],
    windowsApps: [
      '%LOCALAPPDATA%/Programs/Cursor/Cursor.exe',
      '%PROGRAMFILES%/Cursor/Cursor.exe',
    ],
  },
};

const SKILL_ROOTS = [
  { owner: 'portable', rel: '.agents/skills' },
  { owner: 'claude', rel: '.claude/skills' },
  { owner: 'cursor', rel: '.cursor/skills' },
  { owner: 'codex', rel: '.codex/skills' },
];

const PROJECT_INSTRUCTIONS = [
  { owner: 'shared', rel: 'AGENTS.md' },
  { owner: 'claude', rel: 'CLAUDE.md' },
];

const HOME_INSTRUCTIONS = [
  { owner: 'codex', rel: '.codex/AGENTS.md' },
  { owner: 'claude', rel: '.claude/CLAUDE.md' },
];

const CONFIG_DIRS = {
  codex: '.codex',
  claude: '.claude',
  cursor: '.cursor',
};

function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function expandPath(input, home) {
  return input
    .replace(/^~(?=\/|$)/, home)
    .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA || '')
    .replace(/%PROGRAMFILES%/gi, process.env.PROGRAMFILES || '');
}

function commandExists(command) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  try {
    const result = spawnSync(finder, [command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
    });
    return result.status === 0 && Boolean(result.stdout?.trim());
  } catch {
    return false;
  }
}

function extensionRoots(home) {
  const roots = [
    { editor: 'VS Code', path: path.join(home, '.vscode/extensions') },
    { editor: 'VS Code Insiders', path: path.join(home, '.vscode-insiders/extensions') },
    { editor: 'Cursor', path: path.join(home, '.cursor/extensions') },
  ];
  return roots;
}

function extensionMatches(root, ids) {
  if (!exists(root.path)) return [];
  let names = [];
  try { names = fs.readdirSync(root.path); } catch { return []; }
  const matches = [];
  for (const id of ids || []) {
    for (const name of names) {
      if (name === id || name.startsWith(id + '-')) {
        matches.push({ type: 'ide-extension', detail: `${root.editor}: ${name}` });
      }
    }
  }
  return matches;
}

export function detectInstalledHarnesses({ home = os.homedir(), platform = process.platform, commandCheck = commandExists } = {}) {
  home = path.resolve(home);
  const detected = [];

  for (const [key, meta] of Object.entries(HARNESS_META)) {
    const evidence = [];

    for (const command of meta.commands || []) {
      if (commandCheck(command)) evidence.push({ type: 'command', detail: command });
    }

    for (const root of extensionRoots(home)) {
      evidence.push(...extensionMatches(root, meta.vscodeExtensions || []));
    }

    if (platform === 'darwin') {
      for (const app of meta.macApps || []) {
        const expanded = expandPath(app, home);
        if (exists(expanded)) evidence.push({ type: 'app', detail: expanded });
      }
    }

    if (platform === 'win32') {
      for (const app of meta.windowsApps || []) {
        const expanded = expandPath(app, home);
        if (expanded && exists(expanded)) evidence.push({ type: 'app', detail: expanded });
      }
    }

    if (evidence.length) detected.push({ key, label: meta.label, evidence });
  }

  return detected;
}

function walkSkillFiles(root) {
  if (!exists(root)) return [];

  const out = [];
  const stack = [root];
  const visitedDirs = new Set();

  while (stack.length) {
    const dir = stack.pop();

    let realDir;
    try { realDir = fs.realpathSync(dir); } catch { continue; }
    if (visitedDirs.has(realDir)) continue;
    visitedDirs.add(realDir);

    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }

      if (entry.isSymbolicLink()) {
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) stack.push(full);
          else if (stat.isFile() && entry.name === 'SKILL.md') out.push(full);
        } catch {
          // Broken symlink: ignore it rather than failing the whole scan.
        }
        continue;
      }

      if (entry.isFile() && entry.name === 'SKILL.md') out.push(full);
    }
  }

  return out;
}

function skillName(file) {
  const body = readText(file) || '';
  const frontmatter = body.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatter) {
    const m = frontmatter[1].match(/^name:\s*["']?([^\n"']+)["']?\s*$/m);
    if (m) return m[1].trim();
  }
  return path.basename(path.dirname(file));
}

function displayPath(file, cwd, home) {
  if (file === cwd || file.startsWith(cwd + path.sep)) return './' + path.relative(cwd, file).replaceAll(path.sep, '/');
  if (file === home || file.startsWith(home + path.sep)) return '~/' + path.relative(home, file).replaceAll(path.sep, '/');
  return file;
}

function gatherSkills(base, scope, cwd, home) {
  const skills = [];
  for (const spec of SKILL_ROOTS) {
    const root = path.join(base, spec.rel);
    for (const file of walkSkillFiles(root)) {
      const content = readText(file) || '';
      skills.push({
        name: skillName(file),
        owner: spec.owner,
        scope,
        path: displayPath(file, cwd, home),
        hash: hashText(content),
        bytes: Buffer.byteLength(content),
      });
    }
  }
  return skills;
}

function gatherInstructions(base, scope, specs, cwd, home) {
  const out = [];
  for (const spec of specs) {
    const file = path.join(base, spec.rel);
    if (!exists(file)) continue;
    const content = readText(file) || '';
    out.push({
      owner: spec.owner,
      scope,
      path: displayPath(file, cwd, home),
      hash: hashText(content),
      bytes: Buffer.byteLength(content),
    });
  }
  return out;
}

function gatherCursorRules(cwd, home) {
  const roots = [
    { scope: 'project', root: path.join(cwd, '.cursor/rules') },
    { scope: 'global', root: path.join(home, '.cursor/rules') },
  ];
  const rules = [];
  for (const item of roots) {
    if (!exists(item.root)) continue;
    let entries = [];
    try { entries = fs.readdirSync(item.root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.mdc')) continue;
      const file = path.join(item.root, entry.name);
      const content = readText(file) || '';
      rules.push({
        owner: 'cursor',
        scope: item.scope,
        path: displayPath(file, cwd, home),
        hash: hashText(content),
        bytes: Buffer.byteLength(content),
      });
    }
  }
  return rules;
}

function gatherConfigFootprints(cwd, home) {
  const footprints = [];
  for (const [key, rel] of Object.entries(CONFIG_DIRS)) {
    const label = HARNESS_META[key].label;
    const projectPath = path.join(cwd, rel);
    const globalPath = path.join(home, rel);
    if (exists(projectPath)) footprints.push({ key, label, scope: 'project', path: displayPath(projectPath, cwd, home) });
    if (exists(globalPath)) footprints.push({ key, label, scope: 'global', path: displayPath(globalPath, cwd, home) });
  }
  return footprints;
}

function analyzeScope(skills, installedKeys) {
  const byName = new Map();
  for (const skill of skills) {
    if (!byName.has(skill.name)) byName.set(skill.name, []);
    byName.get(skill.name).push(skill);
  }

  const statuses = [];
  const duplicates = [];
  const drift = [];

  for (const [name, copies] of byName) {
    const hashes = new Set(copies.map(c => c.hash));
    const hasDrift = hashes.size > 1;
    const hasPortableCopy = copies.some(c => c.owner === 'portable');
    const nativeOwners = new Set(copies.filter(c => c.owner !== 'portable').map(c => c.owner));

    if (copies.length > 1) duplicates.push({ name, copies });
    if (hasDrift) drift.push({ name, copies });

    const availableToInstalled = (key) => {
      // Current Codex user skills live in ~/.agents/skills.
      if (key === 'codex') {
        return hasPortableCopy;
      }

      // Cursor supports the shared Agent Skills root and compatibility locations
      // for Cursor, Claude, and Codex skills.
      if (key === 'cursor') {
        return hasPortableCopy || nativeOwners.size > 0;
      }

      // Claude Code discovers ~/.claude/skills; a shared canonical skill needs a
      // Claude-side copy or adapter (the fixer creates an individual symlink).
      if (key === 'claude') {
        return nativeOwners.has('claude');
      }

      return nativeOwners.has(key);
    };

    let portableAcrossInstalled = false;
    let reason = 'Only one harness-specific copy found.';

    if (installedKeys.length >= 2) {
      const everyInstalledCanSeeIt = installedKeys.every(availableToInstalled);

      if (!hasDrift && everyInstalledCanSeeIt) {
        portableAcrossInstalled = true;
        reason = hasPortableCopy
          ? 'Shared-format skill is available to every installed agent.'
          : 'Identical native copies exist for every installed agent.';
      } else if (hasDrift) {
        reason = 'Same-name copies differ.';
      } else if (hasPortableCopy && installedKeys.includes('claude') && !nativeOwners.has('claude')) {
        reason = 'Shared-format skill is ready for Codex/Cursor; Claude adapter is missing.';
      } else {
        const present = installedKeys.filter(availableToInstalled);
        reason = present.length
          ? `Available to ${present.map(k => HARNESS_META[k].label).join(', ')}, but not every installed agent.`
          : 'Not available to any installed agent in a supported location.';
      }
    } else if (hasPortableCopy && !hasDrift) {
      reason = 'Stored in the shared Agent Skills format.';
    } else if (hasDrift) {
      reason = 'Same-name copies differ.';
    }

    statuses.push({
      name,
      copies,
      portableAcrossInstalled,
      sharedFormat: hasPortableCopy && !hasDrift,
      drifted: hasDrift,
      nativeOwners: [...nativeOwners],
      reason,
    });
  }

  const totalSkills = statuses.length;
  const portableAcrossInstalled = statuses.filter(s => s.portableAcrossInstalled).length;
  const sharedFormatSkills = statuses.filter(s => s.sharedFormat).length;
  const portableReadyPercent = totalSkills > 0
    ? Math.round(100 * sharedFormatSkills / totalSkills)
    : null;
  const score = installedKeys.length >= 2 && totalSkills > 0
    ? Math.round(100 * portableAcrossInstalled / totalSkills)
    : null;

  const onlyByHarness = {};
  for (const key of installedKeys) onlyByHarness[key] = 0;
  for (const status of statuses) {
    if (status.portableAcrossInstalled || status.sharedFormat || status.drifted) continue;
    const present = installedKeys.filter(k => status.nativeOwners.includes(k));
    if (present.length === 1) onlyByHarness[present[0]] += 1;
  }

  return {
    score,
    portableReadyPercent,
    totalSkills,
    portableAcrossInstalled,
    sharedFormatSkills,
    onlyByHarness,
    duplicates,
    drift,
    statuses,
  };
}

function buildFindings(globalAnalysis, projectAnalysis, installedHarnesses, footprints) {
  const findings = [];
  const installedKeys = installedHarnesses.map(h => h.key);

  if (installedKeys.length < 2) {
    const label = installedHarnesses[0]?.label || 'No supported agent';
    findings.push({
      level: 'info',
      text: installedKeys.length === 1
        ? `Only ${label} is detected, so a cross-agent portability score is not shown.`
        : 'No supported agent installation was detected, so a cross-agent portability score is not shown.',
    });
  } else if (globalAnalysis.totalSkills > 0) {
    findings.push({
      level: globalAnalysis.portableAcrossInstalled === globalAnalysis.totalSkills ? 'good' : 'medium',
      text: `${globalAnalysis.portableAcrossInstalled} of ${globalAnalysis.totalSkills} global skills are available across every detected agent.`,
    });
  }

  if (globalAnalysis.drift.length) findings.push({ level: 'high', text: `${globalAnalysis.drift.length} global skill${globalAnalysis.drift.length === 1 ? '' : 's'} have same-name copies with different contents.` });
  if (projectAnalysis.drift.length) findings.push({ level: 'high', text: `${projectAnalysis.drift.length} project skill${projectAnalysis.drift.length === 1 ? '' : 's'} have same-name copies with different contents.` });

  const staleFootprints = footprints.filter(f => !installedKeys.includes(f.key));
  if (staleFootprints.length) findings.push({ level: 'info', text: `${staleFootprints.length} config footprint${staleFootprints.length === 1 ? '' : 's'} belong to agents that were not detected as installed.` });

  return findings;
}

export function scan({ cwd = process.cwd(), home = os.homedir(), installedHarnesses: installedOverride } = {}) {
  cwd = path.resolve(cwd);
  home = path.resolve(home);

  const installedHarnesses = installedOverride
    ? installedOverride.map(key => ({ key, label: HARNESS_META[key]?.label || key, evidence: [{ type: 'test-override', detail: key }] }))
    : detectInstalledHarnesses({ home });
  const installedKeys = installedHarnesses.map(h => h.key);

  const globalSkills = gatherSkills(home, 'global', cwd, home);
  const projectSkills = gatherSkills(cwd, 'project', cwd, home);
  const instructions = [
    ...gatherInstructions(home, 'global', HOME_INSTRUCTIONS, cwd, home),
    ...gatherInstructions(cwd, 'project', PROJECT_INSTRUCTIONS, cwd, home),
  ];
  const cursorRules = gatherCursorRules(cwd, home);
  const configFootprints = gatherConfigFootprints(cwd, home);

  const globalAnalysis = analyzeScope(globalSkills, installedKeys);
  const projectAnalysis = analyzeScope(projectSkills, installedKeys);
  const findings = buildFindings(globalAnalysis, projectAnalysis, installedHarnesses, configFootprints);

  return {
    version: 3,
    generatedAt: new Date().toISOString(),
    cwd,
    privacy: 'local-only',
    installedHarnesses,
    configFootprints,
    global: { skills: globalSkills, ...globalAnalysis },
    project: { skills: projectSkills, ...projectAnalysis },
    instructions,
    cursorRules,
    findings,
    scoreDefinition: 'Global score = share of unique global skills available across every detected agent. No score is shown unless at least two supported agents are detected.',
  };
}

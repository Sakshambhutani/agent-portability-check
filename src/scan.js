import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const SKILL_ROOTS = [
  { owner: 'portable', scope: 'project', rel: '.agents/skills' },
  { owner: 'claude', scope: 'project', rel: '.claude/skills' },
  { owner: 'cursor', scope: 'project', rel: '.cursor/skills' },
  { owner: 'codex', scope: 'project', rel: '.codex/skills', note: 'compatibility location' },
];

const HOME_SKILL_ROOTS = [
  { owner: 'portable', scope: 'user', rel: '.agents/skills' },
  { owner: 'claude', scope: 'user', rel: '.claude/skills' },
  { owner: 'cursor', scope: 'user', rel: '.cursor/skills' },
  { owner: 'codex', scope: 'user', rel: '.codex/skills', note: 'compatibility location' },
];

const INSTRUCTION_FILES = [
  { owner: 'claude', scope: 'project', rel: 'CLAUDE.md' },
  { owner: 'codex', scope: 'project', rel: 'AGENTS.md' },
  { owner: 'cursor', scope: 'project', rel: 'AGENTS.md' },
  { owner: 'cursor', scope: 'project', rel: 'CLAUDE.md' },
];

const HOME_INSTRUCTION_FILES = [
  { owner: 'claude', scope: 'user', rel: '.claude/CLAUDE.md' },
  { owner: 'codex', scope: 'user', rel: '.codex/AGENTS.md' },
];

function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function walkSkillFiles(root) {
  if (!exists(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name === 'SKILL.md') out.push(full);
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

function relativeDisplay(file, cwd, home) {
  if (file.startsWith(cwd + path.sep) || file === cwd) return './' + path.relative(cwd, file).replaceAll(path.sep, '/');
  if (file.startsWith(home + path.sep) || file === home) return '~/' + path.relative(home, file).replaceAll(path.sep, '/');
  return file;
}

function gatherSkills(base, roots, cwd, home) {
  const skills = [];
  for (const spec of roots) {
    const root = path.join(base, spec.rel);
    for (const file of walkSkillFiles(root)) {
      const content = readText(file) || '';
      skills.push({
        name: skillName(file),
        owner: spec.owner,
        scope: spec.scope,
        path: relativeDisplay(file, cwd, home),
        hash: hashText(content),
        bytes: Buffer.byteLength(content),
      });
    }
  }
  return skills;
}

function gatherInstructions(base, specs, cwd, home) {
  const out = [];
  for (const spec of specs) {
    const file = path.join(base, spec.rel);
    if (!exists(file)) continue;
    const content = readText(file) || '';
    out.push({
      owner: spec.owner,
      scope: spec.scope,
      path: relativeDisplay(file, cwd, home),
      hash: hashText(content),
      bytes: Buffer.byteLength(content),
    });
  }
  return out;
}

function gatherCursorRules(cwd, home) {
  const roots = [path.join(cwd, '.cursor/rules'), path.join(home, '.cursor/rules')];
  const rules = [];
  for (const root of roots) {
    if (!exists(root)) continue;
    let files = [];
    try { files = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of files) {
      if (!entry.isFile() || !entry.name.endsWith('.mdc')) continue;
      const file = path.join(root, entry.name);
      const content = readText(file) || '';
      rules.push({ path: relativeDisplay(file, cwd, home), hash: hashText(content), bytes: Buffer.byteLength(content) });
    }
  }
  return rules;
}

function analyze(skills, instructions, cursorRules) {
  const byName = new Map();
  for (const skill of skills) {
    if (!byName.has(skill.name)) byName.set(skill.name, []);
    byName.get(skill.name).push(skill);
  }

  const duplicates = [];
  const drift = [];
  for (const [name, copies] of byName) {
    if (copies.length > 1) duplicates.push({ name, copies });
    const hashes = new Set(copies.map(c => c.hash));
    if (hashes.size > 1) drift.push({ name, copies });
  }

  const portableSkills = [...byName.values()].filter(copies => copies.some(c => c.owner === 'portable')).length;
  const totalSkills = byName.size;
  const harnessSpecificSkills = [...byName.entries()]
    .filter(([, copies]) => !copies.some(c => c.owner === 'portable') && new Set(copies.map(c => c.owner)).size === 1)
    .map(([name, copies]) => ({ name, owner: copies[0].owner }));

  const hasClaude = instructions.some(i => i.owner === 'claude') || skills.some(s => s.owner === 'claude');
  const hasCodex = instructions.some(i => i.owner === 'codex') || skills.some(s => s.owner === 'portable' || s.owner === 'codex');
  const hasCursor = instructions.some(i => i.owner === 'cursor') || skills.some(s => ['cursor','portable','claude','codex'].includes(s.owner)) || cursorRules.length > 0;
  const activeHarnesses = [hasClaude && 'Claude', hasCodex && 'Codex', hasCursor && 'Cursor'].filter(Boolean);

  let score = 100;
  if (totalSkills > 0) score -= Math.round(30 * (harnessSpecificSkills.length / totalSkills));
  score -= Math.min(20, drift.length * 7);
  score -= Math.min(15, Math.max(0, duplicates.length - drift.length) * 3);
  if (cursorRules.length > 0) score -= Math.min(15, cursorRules.length * 3);
  const projectInstructionKinds = new Set(instructions.filter(i => i.scope === 'project').map(i => path.basename(i.path)));
  if (projectInstructionKinds.size === 1 && activeHarnesses.length >= 2) score -= 10;
  if (activeHarnesses.length <= 1) score -= 10;
  score = Math.max(0, Math.min(100, score));

  const findings = [];
  if (drift.length) findings.push({ level: 'high', text: `${drift.length} skill${drift.length === 1 ? '' : 's'} have different copies with the same name.` });
  if (harnessSpecificSkills.length) findings.push({ level: 'medium', text: `${harnessSpecificSkills.length} skill${harnessSpecificSkills.length === 1 ? '' : 's'} live only in one harness-specific location.` });
  if (cursorRules.length) findings.push({ level: 'medium', text: `${cursorRules.length} Cursor rule${cursorRules.length === 1 ? '' : 's'} may not travel to Claude or Codex as-is.` });
  if (duplicates.length && !drift.length) findings.push({ level: 'low', text: `${duplicates.length} skill${duplicates.length === 1 ? '' : 's'} are duplicated across locations.` });
  if (!findings.length) findings.push({ level: 'good', text: 'No obvious portability problems found in the files this V0 understands.' });

  return { score, totalSkills, portableSkills, duplicates, drift, harnessSpecificSkills, cursorRules, activeHarnesses, findings };
}

export function scan({ cwd = process.cwd(), home = os.homedir() } = {}) {
  cwd = path.resolve(cwd);
  home = path.resolve(home);
  const skills = [
    ...gatherSkills(cwd, SKILL_ROOTS, cwd, home),
    ...gatherSkills(home, HOME_SKILL_ROOTS, cwd, home),
  ];
  const instructions = [
    ...gatherInstructions(cwd, INSTRUCTION_FILES, cwd, home),
    ...gatherInstructions(home, HOME_INSTRUCTION_FILES, cwd, home),
  ];
  const cursorRules = gatherCursorRules(cwd, home);
  const analysis = analyze(skills, instructions, cursorRules);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    cwd,
    privacy: 'local-only',
    skills,
    instructions,
    ...analysis,
  };
}

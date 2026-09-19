import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const SKILL_ROOTS = [
  { owner: 'portable', scope: 'project', rel: '.agents/skills' },
  { owner: 'claude', scope: 'project', rel: '.claude/skills' },
  { owner: 'cursor', scope: 'project', rel: '.cursor/skills' },
  { owner: 'codex', scope: 'project', rel: '.codex/skills' },
];

const HOME_SKILL_ROOTS = [
  { owner: 'portable', scope: 'user', rel: '.agents/skills' },
  { owner: 'claude', scope: 'user', rel: '.claude/skills' },
  { owner: 'cursor', scope: 'user', rel: '.cursor/skills' },
  { owner: 'codex', scope: 'user', rel: '.codex/skills' },
];

const PROJECT_INSTRUCTIONS = [
  { owner: 'shared', scope: 'project', rel: 'AGENTS.md', compatibleWith: ['codex', 'cursor'] },
  { owner: 'claude', scope: 'project', rel: 'CLAUDE.md', compatibleWith: ['claude'] },
];

const HOME_INSTRUCTIONS = [
  { owner: 'claude', scope: 'user', rel: '.claude/CLAUDE.md', compatibleWith: ['claude'] },
  { owner: 'codex', scope: 'user', rel: '.codex/AGENTS.md', compatibleWith: ['codex'] },
];

const HARNESS_DIRS = {
  claude: ['.claude'],
  codex: ['.codex'],
  cursor: ['.cursor'],
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
      compatibleWith: spec.compatibleWith,
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

function detectHarnesses(cwd, home, skills, instructions, cursorRules) {
  const evidence = {
    claude: [],
    codex: [],
    cursor: [],
  };

  for (const harness of Object.keys(HARNESS_DIRS)) {
    for (const rel of HARNESS_DIRS[harness]) {
      if (exists(path.join(cwd, rel))) evidence[harness].push(`./${rel}`);
      if (exists(path.join(home, rel))) evidence[harness].push(`~/${rel}`);
    }
  }

  for (const skill of skills) {
    if (skill.owner in evidence) evidence[skill.owner].push(skill.path);
  }
  for (const instruction of instructions) {
    if (instruction.owner in evidence) evidence[instruction.owner].push(instruction.path);
  }
  for (const rule of cursorRules) evidence.cursor.push(rule.path);

  const labels = { claude: 'Claude', codex: 'Codex', cursor: 'Cursor' };
  const activeHarnesses = Object.entries(evidence)
    .filter(([, items]) => items.length > 0)
    .map(([key]) => labels[key]);

  return { activeHarnesses, harnessEvidence: evidence };
}

function analyzeSkillPortability(skills) {
  const byName = new Map();
  for (const skill of skills) {
    if (!byName.has(skill.name)) byName.set(skill.name, []);
    byName.get(skill.name).push(skill);
  }

  const statuses = [];
  const duplicates = [];
  const drift = [];

  for (const [name, copies] of byName) {
    if (copies.length > 1) duplicates.push({ name, copies });

    const hashes = new Set(copies.map(c => c.hash));
    if (hashes.size > 1) drift.push({ name, copies });

    const owners = new Set(copies.filter(c => c.owner !== 'portable').map(c => c.owner));
    const hasPortableRoot = copies.some(c => c.owner === 'portable');
    const identicalAcrossHarnesses = hashes.size === 1 && owners.size >= 2;

    let portability = 0;
    let reason = 'only one harness-specific copy';
    if (hasPortableRoot) {
      portability = 1;
      reason = 'stored in a shared .agents/skills location';
    } else if (identicalAcrossHarnesses && owners.size >= 3) {
      portability = 1;
      reason = 'identical copies exist across all three supported harnesses';
    } else if (identicalAcrossHarnesses && owners.size === 2) {
      portability = 0.5;
      reason = 'identical copies exist across two harnesses';
    } else if (hashes.size > 1) {
      portability = 0;
      reason = 'same-name copies have drifted';
    }

    statuses.push({ name, copies, portability, reason });
  }

  const totalSkills = statuses.length;
  const score = totalSkills === 0
    ? null
    : Math.round(100 * statuses.reduce((sum, s) => sum + s.portability, 0) / totalSkills);

  const crossHarnessSkills = statuses.filter(s => s.portability > 0).length;
  const fullyPortableSkills = statuses.filter(s => s.portability === 1).length;
  const harnessSpecificSkills = statuses
    .filter(s => s.portability === 0 && s.copies.every(c => c.owner !== 'portable'))
    .map(s => ({ name: s.name, owner: s.copies[0]?.owner || 'unknown', reason: s.reason }));

  return {
    score,
    totalSkills,
    crossHarnessSkills,
    fullyPortableSkills,
    skillPortability: statuses,
    duplicates,
    drift,
    harnessSpecificSkills,
  };
}

function buildFindings(skillAnalysis, cursorRules, activeHarnesses) {
  const findings = [];
  const { totalSkills, crossHarnessSkills, harnessSpecificSkills, drift } = skillAnalysis;

  if (totalSkills > 0 && crossHarnessSkills === 0) {
    findings.push({ level: 'high', text: `None of your ${totalSkills} skills are currently reusable across multiple harnesses.` });
  } else if (harnessSpecificSkills.length) {
    findings.push({ level: 'medium', text: `${harnessSpecificSkills.length} skill${harnessSpecificSkills.length === 1 ? '' : 's'} still live only in one harness-specific location.` });
  }
  if (drift.length) findings.push({ level: 'high', text: `${drift.length} skill${drift.length === 1 ? '' : 's'} have same-name copies with different contents.` });
  if (cursorRules.length) findings.push({ level: 'medium', text: `${cursorRules.length} Cursor rule${cursorRules.length === 1 ? '' : 's'} may need an equivalent instruction when you switch harnesses.` });
  if (activeHarnesses.length === 1) findings.push({ level: 'info', text: `Only ${activeHarnesses[0]} has a harness-specific footprint in the locations checked.` });
  if (totalSkills === 0) findings.push({ level: 'info', text: 'No skills were found in the locations this V0.2 understands, so no portability score was calculated.' });
  if (!findings.length) findings.push({ level: 'good', text: 'No obvious skill-portability problems found in the locations this V0.2 understands.' });

  return findings;
}

export function scan({ cwd = process.cwd(), home = os.homedir() } = {}) {
  cwd = path.resolve(cwd);
  home = path.resolve(home);

  const skills = [
    ...gatherSkills(cwd, SKILL_ROOTS, cwd, home),
    ...gatherSkills(home, HOME_SKILL_ROOTS, cwd, home),
  ];
  const instructions = [
    ...gatherInstructions(cwd, PROJECT_INSTRUCTIONS, cwd, home),
    ...gatherInstructions(home, HOME_INSTRUCTIONS, cwd, home),
  ];
  const cursorRules = gatherCursorRules(cwd, home);
  const skillAnalysis = analyzeSkillPortability(skills);
  const { activeHarnesses, harnessEvidence } = detectHarnesses(cwd, home, skills, instructions, cursorRules);
  const findings = buildFindings(skillAnalysis, cursorRules, activeHarnesses);

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    cwd,
    privacy: 'local-only',
    scoreDefinition: 'Average skill portability: shared location = 100%, identical copies in two harnesses = 50%, one harness or drifted copies = 0%.',
    skills,
    instructions,
    cursorRules,
    activeHarnesses,
    harnessEvidence,
    findings,
    ...skillAnalysis,
  };
}

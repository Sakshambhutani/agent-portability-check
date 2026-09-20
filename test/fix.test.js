import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scan } from '../src/scan.js';
import { planPortableReadyFix, applyPortableReadyFix } from '../src/fix.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-fix-'));
  const cwd = path.join(root, 'repo');
  const home = path.join(root, 'home');
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  return { root, cwd, home };
}

function write(file, content = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test('plans a safe copy from a harness-specific skill to the shared root', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.codex/skills/review/SKILL.md'), '---\nname: review\ndescription: Review code\n---\nReview');
  write(path.join(home, '.codex/skills/review/references/checklist.md'), 'Checklist');

  const before = scan({ cwd, home, installedHarnesses: ['codex'] });
  const plan = planPortableReadyFix(before, { cwd, home });

  assert.equal(plan.copyPlans.length, 1);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(fs.existsSync(path.join(home, '.agents/skills/review')), false);

  const result = applyPortableReadyFix(plan);
  assert.equal(result.applied.length, 1);
  assert.equal(fs.readFileSync(path.join(home, '.agents/skills/review/references/checklist.md'), 'utf8'), 'Checklist');

  const after = scan({ cwd, home, installedHarnesses: ['codex'] });
  assert.equal(after.global.sharedFormatSkills, 1);
  assert.equal(after.global.portableReadyPercent, 100);
});

test('never auto-fixes drifted skills', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.codex/skills/review/SKILL.md'), 'v1');
  write(path.join(home, '.claude/skills/review/SKILL.md'), 'v2');

  const before = scan({ cwd, home, installedHarnesses: ['codex', 'claude'] });
  const plan = planPortableReadyFix(before, { cwd, home });

  assert.equal(plan.copyPlans.length, 0);
  assert.equal(plan.conflicts.length, 1);
});

test('creates a Claude adapter when Claude is installed and no Claude copy exists', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.codex/skills/review/SKILL.md'), '---\nname: review\ndescription: Review code\n---\nReview');

  const before = scan({ cwd, home, installedHarnesses: ['codex', 'claude'] });
  const plan = planPortableReadyFix(before, { cwd, home });

  assert.equal(plan.copyPlans.length, 1);
  assert.equal(plan.adapterPlans.length, 1);

  applyPortableReadyFix(plan);

  const link = path.join(home, '.claude/skills/review');
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
  assert.equal(fs.realpathSync(link), fs.realpathSync(path.join(home, '.agents/skills/review')));
});

test('target Claude creates an adapter even before Claude is installed', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.codex/skills/review/SKILL.md'), '---\nname: review\ndescription: Review code\n---\nReview');

  const before = scan({ cwd, home, installedHarnesses: ['codex'] });
  const plan = planPortableReadyFix(before, { cwd, home, target: 'claude' });

  assert.equal(plan.copyPlans.length, 1);
  assert.equal(plan.adapterPlans.length, 1);

  applyPortableReadyFix(plan);

  assert.equal(
    fs.lstatSync(path.join(home, '.claude/skills/review')).isSymbolicLink(),
    true,
  );
});


test('fixes project-scoped skills into project shared root', () => {
  const { cwd, home } = fixture();
  write(path.join(cwd, '.codex/skills/project-review/SKILL.md'), '---\nname: project-review\ndescription: Review project\n---\nReview');

  const before = scan({ cwd, home, installedHarnesses: ['codex'] });
  const plan = planPortableReadyFix(before, { cwd, home });

  const projectPlan = plan.copyPlans.find(item => item.scope === 'project');
  assert.ok(projectPlan);
  assert.equal(projectPlan.targetDir, path.join(cwd, '.agents/skills/project-review'));

  applyPortableReadyFix(plan);

  const after = scan({ cwd, home, installedHarnesses: ['codex'] });
  assert.equal(after.project.portableReadySkills, 1);
});

test('target Claude adds project adapter for project skill', () => {
  const { cwd, home } = fixture();
  write(path.join(cwd, '.agents/skills/project-review/SKILL.md'), '---\nname: project-review\ndescription: Review project\n---\nReview');

  const before = scan({ cwd, home, installedHarnesses: ['codex'] });
  const plan = planPortableReadyFix(before, { cwd, home, target: 'claude' });

  const adapter = plan.adapterPlans.find(item => item.scope === 'project');
  assert.ok(adapter);
  assert.equal(adapter.linkPath, path.join(cwd, '.claude/skills/project-review'));
});


test('manual conflicts explain the exact invalid package issue', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.codex/skills/broken/SKILL.md'), '---\nname: broken\n---\nRun scripts/missing.sh');

  const before = scan({ cwd, home, installedHarnesses: ['codex'] });
  const plan = planPortableReadyFix(before, { cwd, home });

  assert.equal(plan.copyPlans.length, 0);
  assert.equal(plan.conflicts.length, 1);
  assert.match(plan.conflicts[0].reason, /description/i);
  assert.match(plan.conflicts[0].reason, /scripts\/missing\.sh/);
  assert.match(plan.conflicts[0].reason, /\.codex\/skills\/broken\/SKILL\.md/);
});


test('native open-agent harness skills canonicalize into shared .agents skills', () => {
  const cases = [
    ['.gemini/skills/review/SKILL.md', 'gemini'],
    ['.copilot/skills/review/SKILL.md', 'copilot'],
    ['.config/opencode/skills/review/SKILL.md', 'opencode'],
    ['.roo/skills/review/SKILL.md', 'roo'],
  ];

  for (const [rel, installed] of cases) {
    const { cwd, home } = fixture();
    write(path.join(home, rel), '---\nname: review\ndescription: Review code\n---\nReview');
    const before = scan({ cwd, home, installedHarnesses: [installed] });
    const plan = planPortableReadyFix(before, { cwd, home });
    assert.equal(plan.copyPlans.length, 1, installed);
    applyPortableReadyFix(plan);
    assert.equal(fs.existsSync(path.join(home, '.agents/skills/review/SKILL.md')), true, installed);
    const after = scan({ cwd, home, installedHarnesses: [installed] });
    assert.equal(after.global.portableReadyPercent, 100, installed);
  }
});

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

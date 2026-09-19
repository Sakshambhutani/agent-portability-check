import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scan } from '../src/scan.js';
import { analyzeTargetCompatibility } from '../src/compatibility.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-target-'));
  const cwd = path.join(root, 'repo');
  const home = path.join(root, 'home');
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  return { cwd, home };
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function skill(name, body = '# Instructions') {
  return '---\nname: ' + name + '\ndescription: Test skill ' + name + '\n---\n' + body + '\n';
}

test('Codex migration marks legacy Codex skill as auto-fix', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.codex/skills/review/SKILL.md'), skill('review'));
  const report = scan({ cwd, home, installedHarnesses: ['codex'] });
  const target = analyzeTargetCompatibility(report, 'codex', { cwd, home });
  assert.equal(target.summary.ready, 0);
  assert.equal(target.summary.autoFix, 1);
  assert.equal(target.skills[0].status, 'auto-fix');
});

test('Cursor can use a valid Claude skill through its compatibility directory support', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.claude/skills/review/SKILL.md'), skill('review'));
  const report = scan({ cwd, home, installedHarnesses: ['claude'] });
  const target = analyzeTargetCompatibility(report, 'cursor', { cwd, home });
  assert.equal(target.summary.ready, 1);
  assert.equal(target.skills[0].status, 'ready');
});

test('Claude needs an adapter for a shared Agent Skills copy', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/review/SKILL.md'), skill('review'));
  const report = scan({ cwd, home, installedHarnesses: ['codex'] });
  const target = analyzeTargetCompatibility(report, 'claude', { cwd, home });
  assert.equal(target.summary.autoFix, 1);
  assert.match(target.skills[0].reason, /Claude/i);
});

test('missing companion files require manual attention', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/deploy/SKILL.md'), skill('deploy', 'Run `scripts/deploy.sh` before release.'));
  const report = scan({ cwd, home, installedHarnesses: ['codex'] });
  const target = analyzeTargetCompatibility(report, 'codex', { cwd, home });
  assert.equal(target.summary.manual, 1);
  assert.equal(target.skills[0].status, 'manual');
  assert.match(target.skills[0].reason, /missing/i);
});

test('drifted same-name copies require manual attention', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.claude/skills/review/SKILL.md'), skill('review', 'Version A'));
  write(path.join(home, '.cursor/skills/review/SKILL.md'), skill('review', 'Version B'));
  const report = scan({ cwd, home, installedHarnesses: ['claude', 'cursor'] });
  const target = analyzeTargetCompatibility(report, 'cursor', { cwd, home });
  assert.equal(target.summary.manual, 1);
  assert.match(target.skills[0].reason, /different|drift/i);
});

test('Cursor requires the frontmatter name to match the skill folder', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/review/SKILL.md'), skill('different-name'));
  const report = scan({ cwd, home, installedHarnesses: ['codex'] });
  const target = analyzeTargetCompatibility(report, 'cursor', { cwd, home });
  assert.equal(target.summary.manual, 1);
  assert.match(target.skills[0].reason, /folder/i);
});

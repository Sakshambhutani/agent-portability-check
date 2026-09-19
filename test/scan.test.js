import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scan } from '../src/scan.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-'));
  const cwd = path.join(root, 'repo');
  const home = path.join(root, 'home');
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  return { root, cwd, home };
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test('shared .agents skill is fully portable without inventing a harness', () => {
  const { cwd, home } = fixture();
  write(path.join(cwd, '.agents/skills/review/SKILL.md'), '---\nname: review\n---\nDo reviews');
  write(path.join(cwd, 'AGENTS.md'), '# Shared project rules');
  const r = scan({ cwd, home });
  assert.equal(r.totalSkills, 1);
  assert.equal(r.crossHarnessSkills, 1);
  assert.equal(r.fullyPortableSkills, 1);
  assert.equal(r.score, 100);
  assert.deepEqual(r.activeHarnesses, []);
});

test('one harness-specific skill scores zero and only detects that harness', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.codex/skills/deploy/SKILL.md'), 'deploy');
  const r = scan({ cwd, home });
  assert.equal(r.totalSkills, 1);
  assert.equal(r.crossHarnessSkills, 0);
  assert.equal(r.score, 0);
  assert.deepEqual(r.activeHarnesses, ['Codex']);
});

test('identical copies across two harnesses receive half portability', () => {
  const { cwd, home } = fixture();
  write(path.join(cwd, '.claude/skills/deploy/SKILL.md'), 'deploy same');
  write(path.join(cwd, '.cursor/skills/deploy/SKILL.md'), 'deploy same');
  const r = scan({ cwd, home });
  assert.equal(r.totalSkills, 1);
  assert.equal(r.crossHarnessSkills, 1);
  assert.equal(r.fullyPortableSkills, 0);
  assert.equal(r.score, 50);
  assert.deepEqual(r.activeHarnesses, ['Claude', 'Cursor']);
});

test('same-name skills with different content are drift and score zero', () => {
  const { cwd, home } = fixture();
  write(path.join(cwd, '.claude/skills/deploy/SKILL.md'), 'deploy v1');
  write(path.join(cwd, '.cursor/skills/deploy/SKILL.md'), 'deploy v2');
  const r = scan({ cwd, home });
  assert.equal(r.duplicates.length, 1);
  assert.equal(r.drift.length, 1);
  assert.equal(r.score, 0);
});

test('does not include file contents in the report', () => {
  const { cwd, home } = fixture();
  const secret = 'TOP-SECRET-INSTRUCTION';
  write(path.join(cwd, 'CLAUDE.md'), secret);
  const r = scan({ cwd, home });
  assert.equal(JSON.stringify(r).includes(secret), false);
});

test('returns N/A score when no skills are found', () => {
  const { cwd, home } = fixture();
  const r = scan({ cwd, home });
  assert.equal(r.score, null);
  assert.equal(r.totalSkills, 0);
});

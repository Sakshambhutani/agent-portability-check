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

test('finds a shared portable skill and AGENTS.md', () => {
  const { cwd, home } = fixture();
  write(path.join(cwd, '.agents/skills/review/SKILL.md'), '---\nname: review\n---\nDo reviews');
  write(path.join(cwd, 'AGENTS.md'), '# Project rules');
  const r = scan({ cwd, home });
  assert.equal(r.totalSkills, 1);
  assert.equal(r.portableSkills, 1);
  assert.ok(r.activeHarnesses.includes('Codex'));
  assert.ok(r.activeHarnesses.includes('Cursor'));
});

test('flags same-name skills with different content as drift', () => {
  const { cwd, home } = fixture();
  write(path.join(cwd, '.claude/skills/deploy/SKILL.md'), 'deploy v1');
  write(path.join(cwd, '.cursor/skills/deploy/SKILL.md'), 'deploy v2');
  const r = scan({ cwd, home });
  assert.equal(r.duplicates.length, 1);
  assert.equal(r.drift.length, 1);
  assert.ok(r.score < 100);
});

test('does not include file contents in the report', () => {
  const { cwd, home } = fixture();
  const secret = 'TOP-SECRET-INSTRUCTION';
  write(path.join(cwd, 'CLAUDE.md'), secret);
  const r = scan({ cwd, home });
  assert.equal(JSON.stringify(r).includes(secret), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scan, detectInstalledHarnesses } from '../src/scan.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-'));
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

test('a config folder alone does not count as an installed agent', () => {
  const { home } = fixture();
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  const detected = detectInstalledHarnesses({ home, platform: 'linux', commandCheck: () => false });
  assert.equal(detected.length, 0);
});

test('detects Codex from the VS Code extension', () => {
  const { home } = fixture();
  fs.mkdirSync(path.join(home, '.vscode/extensions/openai.chatgpt-1.2.3'), { recursive: true });
  const detected = detectInstalledHarnesses({ home, platform: 'linux', commandCheck: () => false });
  assert.deepEqual(detected.map(x => x.key), ['codex']);
  assert.equal(detected[0].evidence[0].type, 'ide-extension');
});

test('detects Claude Code from the VS Code extension', () => {
  const { home } = fixture();
  fs.mkdirSync(path.join(home, '.vscode/extensions/anthropic.claude-code-2.0.0'), { recursive: true });
  const detected = detectInstalledHarnesses({ home, platform: 'linux', commandCheck: () => false });
  assert.deepEqual(detected.map(x => x.key), ['claude']);
});

test('one installed agent gets no cross-agent score', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/review/SKILL.md'), '---\nname: review\n---\nDo reviews');
  const r = scan({ cwd, home, installedHarnesses: ['codex'] });
  assert.equal(r.global.totalSkills, 1);
  assert.equal(r.global.sharedFormatSkills, 1);
  assert.equal(r.global.score, null);
});

test('global and project skills are separated', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.codex/skills/global-one/SKILL.md'), 'global');
  write(path.join(cwd, '.codex/skills/project-one/SKILL.md'), 'project');
  const r = scan({ cwd, home, installedHarnesses: ['codex', 'claude'] });
  assert.equal(r.global.totalSkills, 1);
  assert.equal(r.project.totalSkills, 1);
});

test('two installed agents: identical copies in both are portable', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.codex/skills/deploy/SKILL.md'), 'same');
  write(path.join(home, '.claude/skills/deploy/SKILL.md'), 'same');
  const r = scan({ cwd, home, installedHarnesses: ['codex', 'claude'] });
  assert.equal(r.global.portableAcrossInstalled, 1);
  assert.equal(r.global.score, 100);
});

test('two installed agents: one of two global skills portable gives 50%', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.codex/skills/deploy/SKILL.md'), 'same');
  write(path.join(home, '.claude/skills/deploy/SKILL.md'), 'same');
  write(path.join(home, '.codex/skills/research/SKILL.md'), 'codex only');
  const r = scan({ cwd, home, installedHarnesses: ['codex', 'claude'] });
  assert.equal(r.global.totalSkills, 2);
  assert.equal(r.global.portableAcrossInstalled, 1);
  assert.equal(r.global.score, 50);
});

test('shared .agents skill counts across all detected agents', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/review/SKILL.md'), 'shared');
  const r = scan({ cwd, home, installedHarnesses: ['codex', 'claude', 'cursor'] });
  assert.equal(r.global.portableAcrossInstalled, 1);
  assert.equal(r.global.score, 100);
});

test('drifted copies are not portable', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.codex/skills/deploy/SKILL.md'), 'v1');
  write(path.join(home, '.claude/skills/deploy/SKILL.md'), 'v2');
  const r = scan({ cwd, home, installedHarnesses: ['codex', 'claude'] });
  assert.equal(r.global.drift.length, 1);
  assert.equal(r.global.score, 0);
});

test('report never stores instruction content', () => {
  const { cwd, home } = fixture();
  const secret = 'TOP-SECRET-INSTRUCTION';
  write(path.join(cwd, 'CLAUDE.md'), secret);
  const r = scan({ cwd, home, installedHarnesses: ['codex'] });
  assert.equal(JSON.stringify(r).includes(secret), false);
});

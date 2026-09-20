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

function validSkill(name, body = '# Instructions') {
  return `---
name: ${name}
description: Test skill ${name}
---
${body}
`;
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

test('Codex + Claude are portable when shared canonical skill has a Claude adapter', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/deploy/SKILL.md'), validSkill('deploy'));
  fs.mkdirSync(path.join(home, '.claude/skills'), { recursive: true });
  fs.symlinkSync(path.join(home, '.agents/skills/deploy'), path.join(home, '.claude/skills/deploy'), 'dir');
  const r = scan({ cwd, home, installedHarnesses: ['codex', 'claude'] });
  assert.equal(r.global.portableAcrossInstalled, 1);
  assert.equal(r.global.score, 100);
});

test('two installed agents: one of two global skills portable gives 50%', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/deploy/SKILL.md'), validSkill('deploy'));
  fs.mkdirSync(path.join(home, '.claude/skills'), { recursive: true });
  fs.symlinkSync(path.join(home, '.agents/skills/deploy'), path.join(home, '.claude/skills/deploy'), 'dir');
  write(path.join(home, '.codex/skills/research/SKILL.md'), validSkill('research'));
  const r = scan({ cwd, home, installedHarnesses: ['codex', 'claude'] });
  assert.equal(r.global.totalSkills, 2);
  assert.equal(r.global.portableAcrossInstalled, 1);
  assert.equal(r.global.score, 50);
});

test('shared .agents skill is portable across Codex and Cursor', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/review/SKILL.md'), validSkill('review'));
  const r = scan({ cwd, home, installedHarnesses: ['codex', 'cursor'] });
  assert.equal(r.global.portableAcrossInstalled, 1);
  assert.equal(r.global.score, 100);
  assert.equal(r.global.portableReadyPercent, 100);
});

test('Claude requires a Claude-discoverable copy or adapter', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/review/SKILL.md'), validSkill('review'));
  const before = scan({ cwd, home, installedHarnesses: ['codex', 'claude'] });
  assert.equal(before.global.portableAcrossInstalled, 0);
  assert.equal(before.global.score, 0);

  fs.mkdirSync(path.join(home, '.claude/skills'), { recursive: true });
  fs.symlinkSync(path.join(home, '.agents/skills/review'), path.join(home, '.claude/skills/review'), 'dir');
  const after = scan({ cwd, home, installedHarnesses: ['codex', 'claude'] });
  assert.equal(after.global.portableAcrossInstalled, 1);
  assert.equal(after.global.score, 100);
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


test('harness-managed .system skills do not block user portability readiness', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.codex/skills/.system/skill-creator/SKILL.md'), '---\nname: skill-creator\ndescription: Managed\n---\nRun references/missing.md');
  write(path.join(home, '.agents/skills/review/SKILL.md'), validSkill('review'));

  const r = scan({ cwd, home, installedHarnesses: ['codex'] });

  assert.equal(r.global.totalSkills, 1);
  assert.equal(r.global.portableReadySkills, 1);
  assert.equal(r.global.portableReadyPercent, 100);
  assert.equal(r.global.managedSkillCount, 1);
  assert.equal(r.global.managedSkills[0].name, 'skill-creator');
  assert.ok(r.findings.some(f => /excluded from portability readiness/i.test(f.text)));
});


test('detects Gemini CLI, GitHub Copilot, OpenCode, and Roo Code', () => {
  const { home } = fixture();
  fs.mkdirSync(path.join(home, '.vscode/extensions/github.copilot-1.2.3'), { recursive: true });
  fs.mkdirSync(path.join(home, '.vscode/extensions/rooveterinaryinc.roo-cline-3.0.0'), { recursive: true });
  const detected = detectInstalledHarnesses({
    home,
    platform: 'linux',
    commandCheck: command => ['gemini', 'opencode'].includes(command),
  });
  assert.deepEqual(detected.map(x => x.key), ['gemini', 'copilot', 'opencode', 'roo']);
});

test('shared .agents skills are portable across the open-agent harness wave', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/review/SKILL.md'), validSkill('review'));
  const r = scan({
    cwd,
    home,
    installedHarnesses: ['codex', 'gemini', 'copilot', 'opencode', 'roo'],
  });
  assert.equal(r.global.portableAcrossInstalled, 1);
  assert.equal(r.global.score, 100);
});

test('discovers native skill roots for Gemini, Copilot, OpenCode, and Roo', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.gemini/skills/gemini-review/SKILL.md'), validSkill('gemini-review'));
  write(path.join(home, '.copilot/skills/copilot-review/SKILL.md'), validSkill('copilot-review'));
  write(path.join(home, '.config/opencode/skills/opencode-review/SKILL.md'), validSkill('opencode-review'));
  write(path.join(home, '.roo/skills/roo-review/SKILL.md'), validSkill('roo-review'));

  const r = scan({ cwd, home, installedHarnesses: ['gemini'] });
  const owners = new Set(r.global.skills.map(skill => skill.owner));
  for (const owner of ['gemini', 'copilot', 'opencode', 'roo']) assert.ok(owners.has(owner));
});

test('discovers Roo mode-specific skills', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.roo/skills-code/refactor/SKILL.md'), validSkill('refactor'));
  const r = scan({ cwd, home, installedHarnesses: ['roo'] });
  const skill = r.global.skills.find(item => item.name === 'refactor');
  assert.equal(skill.owner, 'roo');
  assert.equal(skill.mode, 'code');
});


test('global-only scan skips project skills, instructions, rules, and footprints', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/global-review/SKILL.md'), validSkill('global-review'));
  write(path.join(cwd, '.agents/skills/project-review/SKILL.md'), validSkill('project-review'));
  write(path.join(home, '.gemini/GEMINI.md'), 'global instructions');
  write(path.join(cwd, 'GEMINI.md'), 'project instructions');
  write(path.join(home, '.cursor/rules/global.mdc'), 'global rule');
  write(path.join(cwd, '.cursor/rules/project.mdc'), 'project rule');
  write(path.join(home, '.gemini/settings.json'), '{}');
  write(path.join(cwd, '.gemini/settings.json'), '{}');

  const r = scan({
    cwd,
    home,
    installedHarnesses: ['gemini', 'cursor'],
    scope: 'global',
  });

  assert.equal(r.scopeMode, 'global');
  assert.equal(r.projectScopeSkipped, true);
  assert.equal(r.global.totalSkills, 1);
  assert.equal(r.project.totalSkills, 0);
  assert.equal(r.project.skills.length, 0);
  assert.equal(r.instructions.every(item => item.scope === 'global'), true);
  assert.equal(r.rules.every(item => item.scope === 'global'), true);
  assert.equal(r.configFootprints.every(item => item.scope === 'global'), true);
  assert.equal(JSON.stringify(r).includes('project-review'), false);
});

test('scan rejects unsupported scope values', () => {
  const { cwd, home } = fixture();
  assert.throws(
    () => scan({ cwd, home, scope: 'project-only' }),
    /Unsupported scan scope/,
  );
});


test('discovers Claude skills from installed plugin records', () => {
  const { cwd, home } = fixture();
  const pluginRoot = path.join(home, '.claude/plugins/cache/community/reviewer/1.2.3');
  write(path.join(pluginRoot, 'skills/deep-review/SKILL.md'), validSkill('deep-review'));
  write(
    path.join(home, '.claude/plugins/installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'reviewer@community': [{
          scope: 'user',
          installPath: pluginRoot,
          version: '1.2.3',
        }],
      },
    }),
  );

  const r = scan({ cwd, home, installedHarnesses: ['claude', 'codex'] });
  const found = r.global.skills.find(item => item.name === 'deep-review');

  assert.ok(found);
  assert.equal(found.sourceType, 'plugin');
  assert.equal(found.pluginHost, 'claude');
  assert.equal(found.pluginId, 'reviewer@community');
  assert.equal(r.global.totalSkills, 1);
  assert.equal(r.global.portableAcrossInstalled, 0);
});

test('discovers enabled Codex plugin skills from the active cache', () => {
  const { cwd, home } = fixture();
  const pluginRoot = path.join(home, '.codex/plugins/cache/team/reviewer/1.0.0');
  write(path.join(pluginRoot, 'skills/deep-review/SKILL.md'), validSkill('deep-review'));
  write(
    path.join(home, '.codex/config.toml'),
    '[plugins."reviewer@team"]\nenabled = true\n',
  );

  const r = scan({ cwd, home, installedHarnesses: ['codex'] });
  const found = r.global.skills.find(item => item.name === 'deep-review');

  assert.ok(found);
  assert.equal(found.sourceType, 'plugin');
  assert.equal(found.pluginHost, 'codex');
  assert.equal(found.pluginId, 'reviewer@team');
});

test('reference anchors and plugin URLs do not become missing files', () => {
  const { cwd, home } = fixture();
  write(
    path.join(home, '.agents/skills/review/SKILL.md'),
    validSkill('review', 'Read [guide](references/guide.md#usage) and [plugin docs](plugin://reviewer/help).'),
  );
  write(path.join(home, '.agents/skills/review/references/guide.md'), '# Guide');

  const r = scan({ cwd, home, installedHarnesses: ['codex'] });
  const copy = r.global.skills.find(item => item.name === 'review');

  assert.deepEqual(copy.missingReferences, []);
  assert.deepEqual(copy.externalReferences, []);
  assert.equal(copy.packageValid, true);
});

test('plugin-root companion files are discovered but marked external to the skill directory', () => {
  const { cwd, home } = fixture();
  const pluginRoot = path.join(home, '.claude/plugins/cache/community/reviewer/1.2.3');
  write(
    path.join(pluginRoot, 'skills/deep-review/SKILL.md'),
    validSkill('deep-review', 'Run ${CLAUDE_PLUGIN_ROOT}/scripts/check.sh'),
  );
  write(path.join(pluginRoot, 'scripts/check.sh'), '#!/bin/sh\nexit 0\n');
  write(
    path.join(home, '.claude/plugins/installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'reviewer@community': [{ scope: 'user', installPath: pluginRoot }],
      },
    }),
  );

  const r = scan({ cwd, home, installedHarnesses: ['claude'] });
  const copy = r.global.skills.find(item => item.name === 'deep-review');

  assert.equal(copy.packageValid, true);
  assert.deepEqual(copy.missingReferences, []);
  assert.deepEqual(copy.externalReferences, ['${CLAUDE_PLUGIN_ROOT}/scripts/check.sh']);
});

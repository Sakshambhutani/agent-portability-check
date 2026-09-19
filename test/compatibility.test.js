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


test('missing CLI dependency blocks local target readiness', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/release/SKILL.md'), skill('release', 'Run `jq --version` before release.'));

  const report = scan({ cwd, home, installedHarnesses: ['codex'] });
  const target = analyzeTargetCompatibility(report, 'codex', {
    cwd,
    home,
    commandCheck: command => command !== 'jq',
  });

  assert.equal(target.summary.manual, 1);
  assert.match(target.skills[0].reason, /jq/);
  assert.equal(target.skills[0].dependencies.commands[0].available, false);
});

test('missing environment variable blocks local target readiness', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/deploy/SKILL.md'), skill('deploy', 'Use $DEPLOY_TOKEN when deploying.'));

  const report = scan({ cwd, home, installedHarnesses: ['codex'] });
  const target = analyzeTargetCompatibility(report, 'codex', {
    cwd,
    home,
    env: {},
  });

  assert.equal(target.summary.manual, 1);
  assert.match(target.skills[0].reason, /DEPLOY_TOKEN/);
});

test('explicit MCP tool reference requires the server on the target harness', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/observe/SKILL.md'), skill('observe', 'Use mcp__datadog__search for incidents.'));

  const report = scan({ cwd, home, installedHarnesses: ['codex'] });
  const missing = analyzeTargetCompatibility(report, 'codex', {
    cwd,
    home,
    mcpServers: { codex: [] },
  });
  assert.equal(missing.summary.manual, 1);
  assert.match(missing.skills[0].reason, /datadog/);

  const configured = analyzeTargetCompatibility(report, 'codex', {
    cwd,
    home,
    mcpServers: { codex: ['datadog'] },
  });
  assert.equal(configured.summary.ready, 1);
});

test('Cursor Cloud flags global Agent Skills as local-only', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/review/SKILL.md'), skill('review'));

  const report = scan({ cwd, home, installedHarnesses: ['codex'] });
  const target = analyzeTargetCompatibility(report, 'cursor', {
    cwd,
    home,
    runtime: 'cloud',
  });

  assert.equal(target.summary.manual, 1);
  assert.equal(target.localOnlyRisks.length, 1);
  assert.match(target.skills[0].reason, /Cloud/i);
});

test('Cursor Cloud accepts project Agent Skills from the repository', () => {
  const { cwd, home } = fixture();
  write(path.join(cwd, '.agents/skills/review/SKILL.md'), skill('review'));

  const report = scan({ cwd, home, installedHarnesses: ['codex'] });
  const target = analyzeTargetCompatibility(report, 'cursor', {
    cwd,
    home,
    runtime: 'cloud',
  });

  assert.equal(target.summary.ready, 1);
  assert.equal(target.summary.manual, 0);
});

test('Cursor Cloud treats required environment variables as cloud secrets to configure', () => {
  const { cwd, home } = fixture();
  write(path.join(cwd, '.agents/skills/deploy/SKILL.md'), skill('deploy', 'Use ${DEPLOY_TOKEN} for deployment.'));

  const report = scan({ cwd, home, installedHarnesses: ['codex'] });
  const target = analyzeTargetCompatibility(report, 'cursor', {
    cwd,
    home,
    runtime: 'cloud',
    env: { DEPLOY_TOKEN: 'present-locally' },
  });

  assert.equal(target.summary.manual, 1);
  assert.match(target.skills[0].reason, /cloud secret/i);
});

test('harness-specific instructions are surfaced as context risks', () => {
  const { cwd, home } = fixture();
  write(path.join(home, '.agents/skills/review/SKILL.md'), skill('review'));
  write(path.join(cwd, 'CLAUDE.md'), '# Claude-only conventions');
  write(path.join(cwd, '.cursor/rules/quality.mdc'), 'Always run tests.');

  const report = scan({ cwd, home, installedHarnesses: ['claude'] });
  const target = analyzeTargetCompatibility(report, 'codex', { cwd, home });

  assert.equal(target.contextRisks.length, 2);
  assert.ok(target.contextRisks.some(risk => risk.path.endsWith('CLAUDE.md')));
  assert.ok(target.contextRisks.some(risk => risk.path.endsWith('quality.mdc')));
});

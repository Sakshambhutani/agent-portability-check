import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);

test('portable plugin manifest and agent-portability skill are valid', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'agent-portability');
  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');

  const claudeManifest = JSON.parse(
    fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8')
  );
  assert.equal(claudeManifest.name, 'agent-portability');
  assert.equal(claudeManifest.version, manifest.version);

  const skillPath = path.join(root, 'skills/agent-portability/SKILL.md');
  const content = fs.readFileSync(skillPath, 'utf8');
  assert.match(content, /^---\nname: agent-portability\ndescription: .+\n---/);
  assert.match(content, /--no-publish/);
  assert.match(content, /references\/REMEDIATION\.md/);
  assert.match(content, /references\/SCOPE-AND-CLAIMS\.md/);

  assert.equal(fs.existsSync(path.join(root, 'skills/agent-portability/references/REMEDIATION.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'skills/agent-portability/references/SCOPE-AND-CLAIMS.md')), true);
});

test('repository marketplace points at the portable plugin root', () => {
  const marketplace = JSON.parse(
    fs.readFileSync(path.join(root, '.agents/plugins/marketplace.json'), 'utf8')
  );
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, 'agent-portability');
  assert.equal(marketplace.plugins[0].source.path, '.');
});

test('CLI exposes local-only no-publish mode', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'src/index.js'), '--help'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--no-publish/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import resultHandler from '../api/result.js';
import teamPageHandler from '../api/team-page.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);

function jsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

async function render(handler, query = {}) {
  let body = '';
  const res = {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(value) { body = String(value); return this; },
    json(value) { body = JSON.stringify(value); return this; },
  };
  await handler({
    query,
    url:'/api/test',
    headers: { host: 'agent-portability-check.vercel.app' },
    method: 'GET',
  }, res);
  return body;
}

function scriptsFromHtml(html) {
  return [...html.matchAll(/<script(?:\s+type=["']module["'])?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(Boolean);
}

function checkJs(source, label) {
  const temp = path.join(process.cwd(), '.agent-portability-syntax-' + Math.random().toString(16).slice(2) + '.mjs');
  try {
    fs.writeFileSync(temp, source);
    const result = spawnSync(process.execPath, ['--check', temp], { encoding: 'utf8' });
    assert.equal(result.status, 0, label + '\n' + (result.stderr || result.stdout || 'syntax check failed'));
  } finally {
    try { fs.unlinkSync(temp); } catch {}
  }
}

test('all server-side JavaScript parses', () => {
  const files = [
    ...jsFiles(path.join(root, 'api')),
    ...jsFiles(path.join(root, 'lib')),
    ...jsFiles(path.join(root, 'src')),
  ];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, path.relative(root, file) + '\n' + (result.stderr || result.stdout || 'syntax check failed'));
  }
});

test('landing page client script parses', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = scriptsFromHtml(html);
  assert.ok(scripts.length >= 1);
  for (const [index, script] of scripts.entries()) checkJs(script, 'index.html script ' + index);
});

test('landing page frames portability across harnesses and runtimes', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /Your agent works here/);
  assert.match(html, /data-target="claude"/);
  assert.match(html, /data-target="codex"/);
  assert.match(html, /data-target="cursor" data-runtime="cloud"/);
  assert.match(html, /data-target="gemini" data-runtime="local"/);
  assert.match(html, /data-target="copilot" data-runtime="local"/);
  assert.match(html, /data-target="copilot" data-runtime="cloud"/);
  assert.match(html, /data-target="opencode" data-runtime="local"/);
  assert.match(html, /data-target="roo" data-runtime="local"/);
  assert.match(html, /Cursor Cloud/);
  assert.match(html, /Copilot Cloud Agent/);
  assert.match(html, />Understand</);
  assert.doesNotMatch(html, />Moving to/);
});

test('result page client script parses in before and trophy states', async () => {
  const cases = [
    {
      ref:'before',
      score:'na', total:'7', portable:'0', ready:'2', shared:'2', drift:'1',
      agents:'codex', target:'claude', targetReady:'2', targetTotal:'7',
      targetAuto:'3', targetManual:'2', targetContext:'1', targetDeps:'1',
      runtime:'local', targetComplete:'0',
    },
    {
      ref:'trophy',
      score:'na', total:'7', portable:'0', ready:'7', shared:'7', drift:'0',
      agents:'codex', target:'claude', targetReady:'7', targetTotal:'7',
      targetAuto:'0', targetManual:'0', targetContext:'0', targetDeps:'0',
      runtime:'local', targetComplete:'1',
    },
  ];
  for (const query of cases) {
    const html = await render(resultHandler, query);
    for (const [index, script] of scriptsFromHtml(html).entries()) {
      checkJs(script, 'result page script ' + index);
    }
  }
});




test('result pages render new harness targets and cloud labels', async () => {
  const cases = [
    ['gemini', 'local', 'Gemini CLI'],
    ['copilot', 'local', 'GitHub Copilot'],
    ['copilot', 'cloud', 'GitHub Copilot Cloud Agent'],
    ['opencode', 'local', 'OpenCode'],
    ['roo', 'local', 'Roo Code'],
  ];
  for (const [target, runtime, label] of cases) {
    const html = await render(resultHandler, {
      ref:'new-harness-' + target + '-' + runtime,
      score:'na', total:'2', portable:'0', ready:'2', shared:'2', drift:'0',
      agents:'codex,' + target, target, targetReady:'2', targetTotal:'2',
      targetAuto:'0', targetManual:'0', targetContext:'1', targetDeps:'0',
      runtime, targetComplete:'1',
    });
    assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\test('team compare is always available while social sharing stays achievement-gated', async () => {')));
    assert.match(html, /id="linkedin"/);
    for (const [index, script] of scriptsFromHtml(html).entries()) {
      checkJs(script, 'new harness result script ' + target + ' ' + runtime + ' #' + index);
    }
  }
});

test('team compare is always available while social sharing stays achievement-gated', async () => {
  const before = await render(resultHandler, {
    ref:'before-gating',
    score:'na', total:'3', portable:'0', ready:'2', shared:'2', drift:'0',
    agents:'codex', target:'claude', targetReady:'2', targetTotal:'3',
    targetAuto:'0', targetManual:'1', targetContext:'1', targetDeps:'0',
    runtime:'local', targetComplete:'0',
  });
  assert.match(before, /This is your diagnostic/i);
  assert.match(before, /Copy diagnostic link/);
  assert.doesNotMatch(before, /id="linkedin"/);
  assert.match(before, /id="teamAction"/);
  assert.match(before, /id="identityPanel"/);
  assert.match(before, /Compare with your team/);

  const trophy = await render(resultHandler, {
    ref:'trophy-gating',
    score:'na', total:'3', portable:'0', ready:'3', shared:'3', drift:'0',
    agents:'codex', target:'claude', targetReady:'3', targetTotal:'3',
    targetAuto:'0', targetManual:'0', targetContext:'1', targetDeps:'0',
    runtime:'local', targetComplete:'1',
  });
  assert.match(trophy, /id="linkedin"/);
  assert.match(trophy, /Challenge a teammate/);
  assert.match(trophy, /id="teamAction"/);
  assert.match(trophy, /3 skill packages are discoverable/i);
  assert.match(trophy, /1 context gap/i);
  assert.match(trophy, /Save result \/ Compare team/);
});

test('team page client script parses', async () => {
  const html = await render(teamPageHandler, { code:'preview-team' });
  const scripts = scriptsFromHtml(html);
  assert.ok(scripts.length >= 1);
  for (const [index, script] of scripts.entries()) checkJs(script, 'team page script ' + index);
});

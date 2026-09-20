import test from 'node:test';
import assert from 'node:assert/strict';
import { browserCommand, openBrowser } from '../src/browser.js';

test('uses platform-native browser open commands', () => {
  assert.deepEqual(browserCommand('https://example.com', 'darwin'), {
    command: 'open',
    args: ['https://example.com'],
  });
  assert.deepEqual(browserCommand('https://example.com', 'linux'), {
    command: 'xdg-open',
    args: ['https://example.com'],
  });
  assert.deepEqual(browserCommand('https://example.com', 'win32'), {
    command: 'cmd',
    args: ['/c', 'start', '', 'https://example.com'],
  });
});

test('opens browser detached when spawning succeeds', () => {
  let called = null;
  const fakeSpawn = (command, args, options) => {
    called = { command, args, options };
    return { unref() {} };
  };
  assert.equal(openBrowser('https://example.com', { platform: 'darwin', spawnImpl: fakeSpawn }), true);
  assert.equal(called.command, 'open');
  assert.deepEqual(called.args, ['https://example.com']);
  assert.equal(called.options.detached, true);
});

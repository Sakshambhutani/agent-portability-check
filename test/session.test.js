import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createSession,
  isAchievement,
  loadLatestSession,
  loadSession,
  saveSession,
  updateSession,
} from '../src/session.js';

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'apc-session-'));
}

function report(ready = 0, total = 7, drift = 0) {
  return {
    global: {
      totalSkills: total,
      portableReadySkills: ready,
      portableReadyPercent: total ? Math.round(ready * 100 / total) : null,
      drift: Array.from({ length: drift }, (_, i) => ({ name: 'd' + i })),
    },
  };
}

test('saves and reloads the latest local session', () => {
  const home = tempHome();
  const session = createSession({
    cwd: '/tmp/project',
    report: report(2, 7),
    resultUrl: 'https://example.com/r/abc',
    resultId: 'abc',
  });
  saveSession(session, { home });

  assert.equal(loadSession(session.id, { home }).id, session.id);
  assert.equal(loadLatestSession({ home }).resultUrl, 'https://example.com/r/abc');
});

test('achievement state updates after a successful rescan', () => {
  const session = createSession({
    cwd: '/tmp/project',
    report: report(0, 7),
  });
  assert.equal(session.achieved, false);

  const updated = updateSession(session, {
    report: report(7, 7),
    resultUrl: 'https://example.com/r/trophy',
    resultId: 'trophy',
  });

  assert.equal(updated.achieved, true);
  assert.equal(updated.status, 'achieved');
  assert.equal(updated.summary.portableReady, 7);
});

test('target compatibility achievement takes precedence', () => {
  assert.equal(
    isAchievement(report(2, 7), {
      skillPackagesReady: true,
      fullyReady: false,
      summary: { ready: 7, total: 7, autoFix: 0, manual: 0 },
    }),
    true,
  );
});

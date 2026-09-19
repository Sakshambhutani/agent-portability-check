import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildScanTelemetry,
  captureTelemetry,
  getTelemetryStatus,
  loadTelemetryConfig,
  setTelemetryPreference,
} from '../src/telemetry.js';

function homeFixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'apc-telemetry-'));
}

test('analytics is unset by default', () => {
  const home = homeFixture();
  assert.equal(getTelemetryStatus({ home }), 'unset');
});

test('opt-in stores an anonymous id; opt-out does not invent one', () => {
  const homeA = homeFixture();
  setTelemetryPreference(true, { home: homeA });
  const on = loadTelemetryConfig({ home: homeA });
  assert.equal(on.analyticsEnabled, true);
  assert.ok(on.anonymousId);

  const homeB = homeFixture();
  setTelemetryPreference(false, { home: homeB });
  const off = loadTelemetryConfig({ home: homeB });
  assert.equal(off.analyticsEnabled, false);
  assert.equal('anonymousId' in off, false);
});

test('telemetry payload uses buckets and excludes paths and skill names', () => {
  const report = {
    installedHarnesses: [{ key: 'codex' }, { key: 'claude' }],
    global: { totalSkills: 7, score: 63, drift: [] },
    project: { totalSkills: 2, drift: [{ name: 'secret-skill', copies: [{ path: '/secret/path' }] }] },
  };
  const properties = buildScanTelemetry(report);
  const text = JSON.stringify(properties);
  assert.equal(properties.global_skill_count_bucket, '6-10');
  assert.equal(properties.global_score_bucket, '60-79');
  assert.equal(text.includes('secret-skill'), false);
  assert.equal(text.includes('/secret/path'), false);
});

test('capture does nothing when analytics is off', async () => {
  const home = homeFixture();
  setTelemetryPreference(false, { home });
  let calls = 0;
  const ok = await captureTelemetry('apc_test', {}, { home, fetchImpl: async () => { calls += 1; return { ok: true }; } });
  assert.equal(ok, false);
  assert.equal(calls, 0);
});

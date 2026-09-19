import test from 'node:test';
import assert from 'node:assert/strict';
import { createShareInfo, normalizeReferralId } from '../src/share.js';

test('normalizes inbound referral ids', () => {
  assert.equal(normalizeReferralId('abc-123_BAD!!'), 'abc-123_BAD');
});

test('creates a self-contained share URL with summary only', () => {
  const report = {
    installedHarnesses: [{ key: 'codex' }, { key: 'claude' }],
    global: { score: 63, totalSkills: 8, portableAcrossInstalled: 5, portableReadySkills: 6, sharedFormatSkills: 6, drift: [] },
  };
  const info = createShareInfo(report, {
    publicUrl: 'https://example.com',
    referralId: 'ref123',
  });
  assert.equal(info.referralId, 'ref123');
  assert.match(info.url, /^https:\/\/example\.com\/r\/ref123\?/);
  assert.match(info.url, /score=63/);
  assert.match(info.url, /total=8/);
  assert.match(info.url, /portable=5/);
  assert.match(info.url, /agents=codex%2Cclaude/);
  assert.equal(info.url.includes('skill'), false);
});

test('returns null without a valid public URL', () => {
  const report = {
    installedHarnesses: [],
    global: { score: null, totalSkills: 0, portableAcrossInstalled: 0, drift: [] },
  };
  assert.equal(createShareInfo(report, { publicUrl: '' }), null);
});

test('includes target migration outcome without local details', () => {
  const report = {
    installedHarnesses: [{ key: 'codex' }],
    global: {
      score: null,
      totalSkills: 7,
      portableAcrossInstalled: 0,
      portableReadySkills: 7,
      sharedFormatSkills: 7,
      drift: [],
    },
  };
  const targetCompatibility = {
    target: 'claude',
    summary: { total: 7, ready: 7, autoFix: 0, manual: 0 },
  };

  const info = createShareInfo(report, {
    publicUrl: 'https://example.com',
    referralId: 'ref456',
    targetCompatibility,
  });

  assert.match(info.url, /target=claude/);
  assert.match(info.url, /targetReady=7/);
  assert.match(info.url, /targetTotal=7/);
  assert.match(info.url, /targetAuto=0/);
  assert.match(info.url, /targetManual=0/);
  assert.equal(info.url.includes('/Users/'), false);
});

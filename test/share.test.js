import test from 'node:test';
import assert from 'node:assert/strict';
import { createShareInfo, normalizeReferralId } from '../src/share.js';

test('normalizes inbound referral ids', () => {
  assert.equal(normalizeReferralId('abc-123_BAD!!'), 'abc-123_BAD');
});

test('creates a self-contained share URL with summary only', () => {
  const report = {
    installedHarnesses: [{ key: 'codex' }, { key: 'claude' }],
    global: { score: 63, totalSkills: 8, portableAcrossInstalled: 5, drift: [] },
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

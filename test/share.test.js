import test from 'node:test';
import assert from 'node:assert/strict';
import { createShareInfo, publishShareResult, normalizeReferralId, normalizeTeamCode } from '../src/share.js';

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


test('normalizes team invite codes and carries them into share URLs', () => {
  assert.equal(normalizeTeamCode('Team_ABC-123!!'), 'Team_ABC-123');
  const report = {
    installedHarnesses: [{ key: 'codex' }],
    global: {
      score: null,
      totalSkills: 1,
      portableAcrossInstalled: 0,
      portableReadySkills: 1,
      sharedFormatSkills: 1,
      drift: [],
    },
  };
  const info = createShareInfo(report, {
    publicUrl: 'https://example.com',
    referralId: 'refteam',
    teamCode: 'Team_ABC-123',
  });
  assert.match(info.url, /team=Team_ABC-123/);
});


test('publishes a short result URL when the backend succeeds', async () => {
  const report = {
    installedHarnesses: [{ key:'codex' }],
    global: {
      score: null,
      totalSkills: 7,
      portableAcrossInstalled: 0,
      portableReadySkills: 7,
      sharedFormatSkills: 7,
      drift: [],
    },
  };

  const info = await publishShareResult(report, {
    publicUrl: 'https://example.com',
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(options.body);
      assert.equal(payload.total, 7);
      assert.equal('skillNames' in payload, false);
      return {
        ok: true,
        async json() { return { code:'short123', url:'https://example.com/r/short123' }; },
      };
    },
  });

  assert.equal(info.short, true);
  assert.equal(info.referralId, 'short123');
  assert.equal(info.url, 'https://example.com/r/short123');
});

test('falls back to a self-contained URL if short publishing fails', async () => {
  const report = {
    installedHarnesses: [],
    global: {
      score: null,
      totalSkills: 1,
      portableAcrossInstalled: 0,
      portableReadySkills: 0,
      sharedFormatSkills: 0,
      drift: [],
    },
  };

  const info = await publishShareResult(report, {
    publicUrl: 'https://example.com',
    fetchImpl: async () => { throw new Error('offline'); },
  });

  assert.equal(info.short, false);
  assert.match(info.url, /total=1/);
});

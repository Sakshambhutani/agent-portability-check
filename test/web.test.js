import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTelemetryPayload } from '../api/telemetry.js';

test('telemetry relay whitelists events and properties', () => {
  const payload = sanitizeTelemetryPayload({
    event: 'apc_scan_completed',
    distinct_id: 'apc_123',
    properties: {
      platform: 'darwin',
      agent_count: 2,
      global_score_bucket: '60-79',
      referral_id: 'ref_123',
      path: '/Users/secret/project',
      skill_name: 'customer-research',
      instructions: 'private text',
    },
  });

  assert.equal(payload.event, 'apc_scan_completed');
  assert.equal(payload.properties.platform, 'darwin');
  assert.equal(payload.properties.agent_count, 2);
  assert.equal(payload.properties.global_score_bucket, '60-79');
  assert.equal(payload.properties.referral_id, 'ref_123');
  assert.equal('path' in payload.properties, false);
  assert.equal('skill_name' in payload.properties, false);
  assert.equal('instructions' in payload.properties, false);
  assert.equal(payload.properties.$process_person_profile, false);
});

test('telemetry relay rejects unknown event names', () => {
  assert.equal(sanitizeTelemetryPayload({
    event: 'send_everything',
    distinct_id: 'abc',
    properties: {},
  }), null);
});

test('telemetry relay sanitizes distinct and referral ids', () => {
  const payload = sanitizeTelemetryPayload({
    event: 'apc_landing_viewed',
    distinct_id: 'web_<script>alert(1)</script>',
    properties: { referral_id: 'ref<script>bad</script>' },
  });

  assert.equal(payload.distinct_id.includes('<'), false);
  assert.equal(payload.properties.referral_id.includes('<'), false);
});


test('telemetry relay accepts manual-review and migration-intent events', () => {
  for (const event of ['apc_manual_issues_reviewed', 'apc_migration_test_selected']) {
    const payload = sanitizeTelemetryPayload({
      event,
      distinct_id: 'apc_123',
      properties: { agent_count: 1 },
    });
    assert.equal(payload?.event, event);
  }
});


test('telemetry relay keeps new harness presence flags', () => {
  const payload = sanitizeTelemetryPayload({
    event: 'apc_scan_completed',
    distinct_id: 'apc_new_harnesses',
    properties: {
      has_gemini: true,
      has_copilot: true,
      has_opencode: true,
      has_roo: true,
    },
  });
  assert.equal(payload.properties.has_gemini, true);
  assert.equal(payload.properties.has_copilot, true);
  assert.equal(payload.properties.has_opencode, true);
  assert.equal(payload.properties.has_roo, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSupabaseConfig, supabaseConfig } from '../lib/supabase.js';
import teamCreate from '../api/team-create.js';
import teamJoin from '../api/team-join.js';
import saveResult from '../api/save-result.js';

function resMock() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

test('team backend is configured with public credentials only', () => {
  const config = supabaseConfig();
  const publicConfig = publicSupabaseConfig();
  assert.equal(config.configured, true);
  assert.match(config.url, /^https:\/\//);
  assert.match(config.publishableKey, /^sb_publishable_/);
  assert.equal('serviceKey' in config, false);
  assert.equal(publicConfig.configured, true);
  assert.equal(publicConfig.anonKey, config.publishableKey);
});

for (const [name, handler, body] of [
  ['create team', teamCreate, { name:'Test' }],
  ['join team', teamJoin, { code:'abc12345' }],
  ['save result', saveResult, { total_skills:1 }],
]) {
  test(name + ' requires explicit authentication', async () => {
    const res = resMock();
    await handler({
      method:'POST',
      body,
      headers:{},
    }, res);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error:'missing_auth' });
  });
}

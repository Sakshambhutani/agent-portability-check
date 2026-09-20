import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCommands,
  extractEnvVars,
  extractCommands,
} from '../src/dependencies.js';

test('classifies example commands as optional', () => {
  const content = 'For example, you can run `vercel --version` or `supabase --version`.';
  const result = classifyCommands(content);
  assert.deepEqual(result.required, []);
  assert.deepEqual(result.optional, ['supabase','vercel']);
  assert.deepEqual(extractCommands(content), ['supabase','vercel']);
});

test('keeps explicit prerequisites required', () => {
  const content = 'Prerequisite: you must have `supabase --version` available.';
  const result = classifyCommands(content);
  assert.deepEqual(result.required, ['supabase']);
  assert.deepEqual(result.optional, []);
});

test('classifies optional environment examples without blocking host-provided plugin roots', () => {
  const content = [
    'For example, set $EXAMPLE_TOKEN if you want the optional provider.',
    'The host exposes ${CLAUDE_PLUGIN_ROOT}/scripts/run.sh.',
    'Required: $DEPLOY_TOKEN must be present.',
  ].join('\n');

  const result = extractEnvVars(content);
  assert.deepEqual(result.required, ['DEPLOY_TOKEN']);
  assert.deepEqual(result.optional, ['EXAMPLE_TOKEN']);
});

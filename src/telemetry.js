import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';

const DEFAULT_PUBLIC_URL = 'https://agent-portability-check.vercel.app';
const POSTHOG_HOST = process.env.APC_POSTHOG_HOST || 'https://us.i.posthog.com';
const POSTHOG_TOKEN = process.env.APC_POSTHOG_TOKEN || '';
const TELEMETRY_ENDPOINT = process.env.APC_TELEMETRY_ENDPOINT || `${DEFAULT_PUBLIC_URL}/api/telemetry`;
const CONSENT_VERSION = 1;
const APP_VERSION = '0.5.1';

function configPath(home = os.homedir()) {
  return path.join(home, '.agent-portability', 'config.json');
}

export function loadTelemetryConfig({ home = os.homedir() } = {}) {
  try {
    return JSON.parse(fs.readFileSync(configPath(home), 'utf8'));
  } catch {
    return null;
  }
}

function writeConfig(config, home = os.homedir()) {
  const file = configPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return config;
}

export function setTelemetryPreference(enabled, { home = os.homedir() } = {}) {
  const current = loadTelemetryConfig({ home }) || {};
  const next = {
    analyticsEnabled: Boolean(enabled),
    consentVersion: CONSENT_VERSION,
    anonymousId: current.anonymousId || (enabled ? crypto.randomUUID() : undefined),
  };
  if (!next.anonymousId) delete next.anonymousId;
  return writeConfig(next, home);
}

export function getTelemetryStatus({ home = os.homedir() } = {}) {
  const config = loadTelemetryConfig({ home });
  if (!config || config.consentVersion !== CONSENT_VERSION) return 'unset';
  return config.analyticsEnabled ? 'on' : 'off';
}

export function telemetryDestinationConfigured() {
  return Boolean(TELEMETRY_ENDPOINT || POSTHOG_TOKEN);
}

export async function ensureTelemetryPreference({ home = os.homedir(), allowPrompt = true, input = process.stdin, output = process.stdout } = {}) {
  const existing = loadTelemetryConfig({ home });
  if (existing?.consentVersion === CONSENT_VERSION && typeof existing.analyticsEnabled === 'boolean') {
    return { enabled: existing.analyticsEnabled, justEnabled: false, config: existing };
  }

  if (!allowPrompt || !telemetryDestinationConfigured()) {
    return { enabled: false, justEnabled: false, config: existing };
  }

  const rl = readline.createInterface({ input, output });
  let answer = '';
  try {
    answer = await rl.question(
      '\nHelp improve Agent Portability Check with anonymous usage analytics?\n' +
      'Sends: app version, OS, agents detected, skill-count buckets, score bucket, and share-card generation.\n' +
      'Never sends: skill names, file paths, instruction contents, repo names, emails, or account IDs.\n' +
      'Enable anonymous analytics? [y/N] '
    );
  } finally {
    rl.close();
  }

  const enabled = /^y(es)?$/i.test(answer.trim());
  const config = setTelemetryPreference(enabled, { home });
  return { enabled, justEnabled: enabled, config };
}

function countBucket(value) {
  if (value <= 0) return '0';
  if (value <= 5) return '1-5';
  if (value <= 10) return '6-10';
  if (value <= 25) return '11-25';
  return '26+';
}

function scoreBucket(score) {
  if (score === null || score === undefined) return 'not_available';
  if (score < 20) return '0-19';
  if (score < 40) return '20-39';
  if (score < 60) return '40-59';
  if (score < 80) return '60-79';
  return '80-100';
}

export function buildScanTelemetry(report) {
  const installed = new Set(report.installedHarnesses.map(h => h.key));
  return {
    app_version: APP_VERSION,
    platform: process.platform,
    node_major: Number(process.versions.node.split('.')[0]),
    agent_count: installed.size,
    has_codex: installed.has('codex'),
    has_claude: installed.has('claude'),
    has_cursor: installed.has('cursor'),
    global_skill_count_bucket: countBucket(report.global.totalSkills),
    project_skill_count_bucket: countBucket(report.project.totalSkills),
    global_score_bucket: scoreBucket(report.global.score),
    portable_ready_bucket: scoreBucket(report.global.portableReadyPercent),
    global_drift_count_bucket: countBucket(report.global.drift.length),
    project_drift_count_bucket: countBucket(report.project.drift.length),
    has_cross_agent_score: report.global.score !== null,
  };
}

export async function captureTelemetry(event, properties = {}, { home = os.homedir(), fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') return false;
  const config = loadTelemetryConfig({ home });
  if (!config?.analyticsEnabled || !config.anonymousId || !telemetryDestinationConfigured()) return false;

  const payload = {
    event,
    distinct_id: `apc_${config.anonymousId}`,
    properties: {
      $process_person_profile: false,
      source: 'agent-portability-check-cli',
      ...properties,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);

  try {
    const url = TELEMETRY_ENDPOINT || `${POSTHOG_HOST}/i/v0/e/`;
    const body = TELEMETRY_ENDPOINT
      ? payload
      : { api_key: POSTHOG_TOKEN, ...payload };

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

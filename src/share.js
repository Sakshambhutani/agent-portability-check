import crypto from 'node:crypto';

const DEFAULT_PUBLIC_URL = 'https://agent-portability-check.vercel.app';
const SHARE_VERSION = '7';

export function normalizeReferralId(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
}

export function normalizeTeamCode(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
}

export function createReferralId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function buildSharePayload(report, {
  targetCompatibility = null,
  teamCode = '',
} = {}) {
  return {
    score: report.global.score,
    total: report.global.totalSkills,
    portable: report.global.portableAcrossInstalled,
    ready: report.global.portableReadySkills ?? report.global.sharedFormatSkills,
    shared: report.global.sharedFormatSkills,
    drift: report.global.drift.length,
    agents: report.installedHarnesses.map(h => h.key),
    target: targetCompatibility?.target || null,
    targetReady: targetCompatibility?.summary?.ready || 0,
    targetTotal: targetCompatibility?.summary?.total || 0,
    targetAuto: targetCompatibility?.summary?.autoFix || 0,
    targetManual: targetCompatibility?.summary?.manual || 0,
    targetContext: targetCompatibility?.contextRisks?.length || 0,
    targetDeps: targetCompatibility?.dependencyRiskCount || 0,
    runtime: targetCompatibility?.runtime || 'local',
    targetComplete: Boolean(targetCompatibility?.fullyReady),
    team: normalizeTeamCode(teamCode) || null,
  };
}

export function createShareInfo(report, {
  publicUrl = process.env.APC_PUBLIC_URL || DEFAULT_PUBLIC_URL,
  referralId = createReferralId(),
  targetCompatibility = null,
  teamCode = '',
} = {}) {
  if (!publicUrl) return null;

  let base;
  try {
    base = new URL(publicUrl);
  } catch {
    return null;
  }

  const ref = normalizeReferralId(referralId);
  if (!ref) return null;

  const payload = buildSharePayload(report, { targetCompatibility, teamCode });
  const url = new URL(`/r/${ref}`, base);
  url.searchParams.set('v', SHARE_VERSION);
  url.searchParams.set('score', payload.score === null ? 'na' : String(payload.score));
  url.searchParams.set('total', String(payload.total));
  url.searchParams.set('portable', String(payload.portable));
  url.searchParams.set('ready', String(payload.ready));
  url.searchParams.set('shared', String(payload.shared));
  url.searchParams.set('drift', String(payload.drift));
  url.searchParams.set('agents', payload.agents.join(','));
  if (payload.team) url.searchParams.set('team', payload.team);

  if (payload.target) {
    url.searchParams.set('target', payload.target);
    url.searchParams.set('targetReady', String(payload.targetReady));
    url.searchParams.set('targetTotal', String(payload.targetTotal));
    url.searchParams.set('targetAuto', String(payload.targetAuto));
    url.searchParams.set('targetManual', String(payload.targetManual));
    url.searchParams.set('targetContext', String(payload.targetContext));
    url.searchParams.set('targetDeps', String(payload.targetDeps));
    url.searchParams.set('runtime', payload.runtime);
    url.searchParams.set('targetComplete', payload.targetComplete ? '1' : '0');
  }

  return {
    referralId: ref,
    url: url.toString(),
    publicUrl: base.origin,
    short: false,
  };
}

export async function publishShareResult(report, {
  publicUrl = process.env.APC_PUBLIC_URL || DEFAULT_PUBLIC_URL,
  targetCompatibility = null,
  teamCode = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 2500,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    return createShareInfo(report, { publicUrl, targetCompatibility, teamCode });
  }

  let base;
  try {
    base = new URL(publicUrl);
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL('/api/result', base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(buildSharePayload(report, { targetCompatibility, teamCode })),
    });
    if (!response.ok) throw new Error('publish_failed');
    const data = await response.json();
    const code = normalizeReferralId(data.code);
    if (!code) throw new Error('invalid_code');
    return {
      referralId: code,
      url: new URL(`/r/${code}`, base).toString(),
      publicUrl: base.origin,
      short: true,
    };
  } catch {
    return createShareInfo(report, { publicUrl, targetCompatibility, teamCode });
  } finally {
    clearTimeout(timer);
  }
}

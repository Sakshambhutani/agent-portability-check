import crypto from 'node:crypto';

export function normalizeReferralId(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
}

export function createReferralId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function createShareInfo(report, {
  publicUrl = process.env.APC_PUBLIC_URL || '',
  referralId = createReferralId(),
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

  const url = new URL(`/r/${ref}`, base);
  url.searchParams.set('score', report.global.score === null ? 'na' : String(report.global.score));
  url.searchParams.set('total', String(report.global.totalSkills));
  url.searchParams.set('portable', String(report.global.portableAcrossInstalled));
  url.searchParams.set('drift', String(report.global.drift.length));
  url.searchParams.set('agents', report.installedHarnesses.map(h => h.key).join(','));

  return {
    referralId: ref,
    url: url.toString(),
    publicUrl: base.origin,
  };
}

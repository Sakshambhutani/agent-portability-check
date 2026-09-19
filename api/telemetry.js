const ALLOWED_EVENTS = new Set([
  'apc_landing_viewed',
  'apc_command_copied',
  'apc_referral_page_opened',
  'apc_check_yours_clicked',
  'apc_linkedin_share_clicked',
  'apc_x_share_clicked',
  'apc_copy_link_clicked',
  'apc_scan_completed',
  'apc_share_card_generated',
  'apc_share_link_generated',
  'apc_analytics_enabled',
  'apc_referred_scan_completed',
  'apc_health_check',
  'apc_fix_previewed',
  'apc_fix_applied',
  'apc_portable_ready_achieved',
]);

const ALLOWED_PROPERTIES = new Set([
  'app_version',
  'platform',
  'node_major',
  'agent_count',
  'has_codex',
  'has_claude',
  'has_cursor',
  'global_skill_count_bucket',
  'project_skill_count_bucket',
  'global_score_bucket',
  'portable_ready_bucket',
  'global_drift_count_bucket',
  'project_drift_count_bucket',
  'has_cross_agent_score',
  'referral_id',
  'share_surface',
  'source',
]);

function cleanString(value, max = 120) {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/[^a-zA-Z0-9_.:@+\-]/g, '').slice(0, max);
  return clean || undefined;
}

export function sanitizeTelemetryPayload(input) {
  if (!input || typeof input !== 'object') return null;
  if (!ALLOWED_EVENTS.has(input.event)) return null;

  const distinctId = cleanString(input.distinct_id, 120);
  if (!distinctId) return null;

  const properties = {};
  const incoming = input.properties && typeof input.properties === 'object' ? input.properties : {};

  for (const [key, value] of Object.entries(incoming)) {
    if (!ALLOWED_PROPERTIES.has(key)) continue;
    if (typeof value === 'boolean' || typeof value === 'number') {
      properties[key] = value;
    } else if (typeof value === 'string') {
      const cleaned = cleanString(value, 120);
      if (cleaned !== undefined) properties[key] = cleaned;
    }
  }

  properties.$process_person_profile = false;
  properties.source = 'agent-portability-check';

  return {
    event: input.event,
    distinct_id: distinctId,
    properties,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const token = process.env.POSTHOG_PROJECT_TOKEN;
  const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!token) return res.status(503).json({ error: 'telemetry_not_configured' });

  let raw = '';
  try {
    if (typeof req.body === 'string') raw = req.body;
    else raw = JSON.stringify(req.body || {});
  } catch {
    return res.status(400).json({ error: 'invalid_body' });
  }

  if (Buffer.byteLength(raw) > 8192) return res.status(413).json({ error: 'payload_too_large' });

  let input;
  try {
    input = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const payload = sanitizeTelemetryPayload(input);
  if (!payload) return res.status(400).json({ error: 'invalid_event' });

  try {
    const response = await fetch(`${host.replace(/\/$/, '')}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: token, ...payload }),
    });

    if (!response.ok) return res.status(502).json({ error: 'analytics_upstream_failed' });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ error: 'analytics_unreachable' });
  }
}

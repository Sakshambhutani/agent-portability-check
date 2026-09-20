import { cleanTeamCode, supabaseRpc } from '../lib/supabase.js';

function intValue(value, min, max, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function cleanTarget(value) {
  return ['claude','codex','cursor'].includes(value) ? value : null;
}

function cleanAgents(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => String(v).toLowerCase()))]
    .filter(v => ['codex','claude','cursor'].includes(v))
    .slice(0, 3);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let raw = '';
  try { raw = JSON.stringify(req.body || {}); } catch {
    return res.status(400).json({ error: 'invalid_body' });
  }
  if (Buffer.byteLength(raw) > 4096) {
    return res.status(413).json({ error: 'payload_too_large' });
  }

  const input = req.body && typeof req.body === 'object' ? req.body : {};
  const total = intValue(input.total, 0, 999, 0);
  const target = cleanTarget(input.target);
  const targetTotal = target ? intValue(input.targetTotal, 0, 999, total) : 0;

  const payload = {
    p_score: input.score === null || input.score === undefined
      ? null
      : intValue(input.score, 0, 100, null),
    p_total: total,
    p_portable: intValue(input.portable, 0, total, 0),
    p_ready: intValue(input.ready, 0, total, 0),
    p_shared: intValue(input.shared, 0, total, 0),
    p_drift: intValue(input.drift, 0, 999, 0),
    p_agents: cleanAgents(input.agents),
    p_target: target,
    p_target_ready: target ? intValue(input.targetReady, 0, targetTotal, 0) : 0,
    p_target_total: targetTotal,
    p_target_auto: target ? intValue(input.targetAuto, 0, 999, 0) : 0,
    p_target_manual: target ? intValue(input.targetManual, 0, 999, 0) : 0,
    p_target_context: target ? intValue(input.targetContext, 0, 999, 0) : 0,
    p_target_deps: target ? intValue(input.targetDeps, 0, 999, 0) : 0,
    p_runtime: input.runtime === 'cloud' ? 'cloud' : 'local',
    p_target_complete: Boolean(input.targetComplete),
    p_team_code: cleanTeamCode(input.team) || null,
  };

  try {
    const code = await supabaseRpc('apc_create_public_result', payload);
    if (!code || typeof code !== 'string') {
      return res.status(502).json({ error: 'result_store_failed' });
    }
    const origin = `https://${req.headers.host}`;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      code,
      url: `${origin}/r/${code}`,
    });
  } catch (error) {
    console.error('result_create_failed', error?.data || error?.message || error);
    return res.status(502).json({ error: 'result_store_failed' });
  }
}

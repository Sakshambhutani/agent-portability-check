import { HARNESS_ORDER } from '../src/harnesses.js';
import {
  cleanTeamCode,
  requireSupabaseUser,
  supabaseConfig,
  supabaseRpc,
} from '../lib/supabase.js';

function intValue(value, max = 10000) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : 0;
}

function cleanTarget(value) {
  return HARNESS_ORDER.includes(value) ? value : null;
}

function cleanRuntime(value) {
  return value === 'cloud' ? 'cloud' : 'local';
}

function cleanRef(value) {
  return typeof value === 'string'
    ? value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
    : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!supabaseConfig().configured) {
    return res.status(503).json({ error: 'supabase_not_configured' });
  }

  const auth = await requireSupabaseUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const input = req.body && typeof req.body === 'object' ? req.body : {};

  const mode = input.mode === 'all' ? 'all' : 'single';

  try {
    const result = await supabaseRpc('apc_save_result_v2', {
      p_team_code: cleanTeamCode(input.team_code) || null,
      p_referral_id: cleanRef(input.referral_id),
      p_target: cleanTarget(input.target),
      p_runtime: cleanRuntime(input.runtime),
      p_target_ready: intValue(input.target_ready),
      p_target_total: intValue(input.target_total),
      p_target_auto: intValue(input.target_auto),
      p_target_manual: intValue(input.target_manual),
      p_target_context: intValue(input.target_context),
      p_target_deps: intValue(input.target_deps),
      p_portable_ready: intValue(input.portable_ready),
      p_total_skills: intValue(input.total_skills),
      p_drift: intValue(input.drift),
      p_complete: Boolean(input.complete),
      p_mode: mode,
      p_all_targets_ready: intValue(input.all_targets_ready),
      p_all_targets_total: intValue(input.all_targets_total),
      p_all_manual_targets: intValue(input.all_manual_targets),
      p_all_context_targets: intValue(input.all_context_targets),
      p_all_dependency_blockers: intValue(input.all_dependency_blockers),
    }, { token: auth.token });

    return res.status(200).json({ ok: true, result });
  } catch (error) {
    const detail = String(error?.data?.message || '');
    if (detail.includes('team_not_found')) {
      return res.status(404).json({ error: 'team_not_found' });
    }
    if (detail.includes('join_team_first')) {
      return res.status(403).json({ error: 'join_team_first' });
    }
    if (detail.includes('team_target_mismatch')) {
      return res.status(409).json({ error: 'team_target_mismatch' });
    }
    if (detail.includes('team_mode_mismatch')) {
      return res.status(409).json({ error: 'team_mode_mismatch' });
    }
    console.error('save_result_failed', error?.data || error?.message || error);
    return res.status(502).json({ error: 'save_result_failed' });
  }
}

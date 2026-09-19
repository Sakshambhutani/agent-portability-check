import {
  cleanTeamCode,
  requireSupabaseUser,
  supabaseRest,
  supabaseConfig,
} from '../lib/supabase.js';

function intValue(value, max = 10000) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : 0;
}

function cleanTarget(value) {
  return ['claude','codex','cursor'].includes(value) ? value : null;
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
  const teamCode = cleanTeamCode(input.team_code);
  let teamId = null;

  if (teamCode) {
    const teams = await supabaseRest('apc_teams', {
      query: `select=id&invite_code=eq.${encodeURIComponent(teamCode)}&limit=1`,
    });
    const team = Array.isArray(teams) ? teams[0] : null;
    if (!team) return res.status(404).json({ error: 'team_not_found' });

    const memberships = await supabaseRest('apc_team_members', {
      query: `select=team_id&team_id=eq.${team.id}&user_id=eq.${auth.user.id}&limit=1`,
    });
    if (!Array.isArray(memberships) || !memberships.length) {
      return res.status(403).json({ error: 'join_team_first' });
    }
    teamId = team.id;
  }

  const row = {
    user_id: auth.user.id,
    team_id: teamId,
    referral_id: cleanRef(input.referral_id),
    target: cleanTarget(input.target),
    runtime: cleanRuntime(input.runtime),
    target_ready: intValue(input.target_ready),
    target_total: intValue(input.target_total),
    target_auto: intValue(input.target_auto),
    target_manual: intValue(input.target_manual),
    target_context: intValue(input.target_context),
    target_deps: intValue(input.target_deps),
    portable_ready: intValue(input.portable_ready),
    total_skills: intValue(input.total_skills),
    drift: intValue(input.drift),
    complete: Boolean(input.complete),
  };

  try {
    const saved = await supabaseRest('apc_saved_results', {
      method: 'POST',
      body: row,
      prefer: 'return=representation',
    });
    return res.status(200).json({ ok: true, result: Array.isArray(saved) ? saved[0] : saved });
  } catch (error) {
    console.error('save_result_failed', error?.data || error?.message || error);
    return res.status(502).json({ error: 'save_result_failed' });
  }
}

import { cleanTeamCode, supabaseConfig, supabaseRest } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!supabaseConfig().configured) {
    return res.status(503).json({ error: 'supabase_not_configured' });
  }

  const code = cleanTeamCode(req.query.code);
  if (!code) return res.status(400).json({ error: 'invalid_team_code' });

  try {
    const teams = await supabaseRest('apc_teams', {
      query: `select=id,name,invite_code,target,runtime,created_at&invite_code=eq.${encodeURIComponent(code)}&limit=1`,
    });
    const team = Array.isArray(teams) ? teams[0] : null;
    if (!team) return res.status(404).json({ error: 'team_not_found' });

    const members = await supabaseRest('apc_team_members', {
      query: `select=user_id,display_name,joined_at&team_id=eq.${team.id}&order=joined_at.asc&limit=200`,
    });
    const results = await supabaseRest('apc_saved_results', {
      query: `select=user_id,target,runtime,target_ready,target_total,target_auto,target_manual,target_context,target_deps,portable_ready,total_skills,drift,complete,created_at&team_id=eq.${team.id}&order=created_at.desc&limit=500`,
    });

    const latest = new Map();
    for (const result of Array.isArray(results) ? results : []) {
      if (!latest.has(result.user_id)) latest.set(result.user_id, result);
    }

    const leaderboard = (Array.isArray(members) ? members : []).map((member, index) => {
      const result = latest.get(member.user_id) || null;
      const ready = result?.target ? result.target_ready : result?.portable_ready || 0;
      const total = result?.target ? result.target_total : result?.total_skills || 0;
      const percent = total > 0 ? Math.round(100 * ready / total) : null;
      return {
        display_name: member.display_name || `Member ${index + 1}`,
        joined_at: member.joined_at,
        result: result ? {
          target: result.target,
          runtime: result.runtime,
          ready,
          total,
          percent,
          auto_fix: result.target_auto,
          manual: result.target_manual,
          context_gaps: result.target_context,
          dependency_blockers: result.target_deps,
          drift: result.drift,
          complete: result.complete,
          created_at: result.created_at,
        } : null,
      };
    });

    leaderboard.sort((a, b) => {
      const ap = a.result?.percent ?? -1;
      const bp = b.result?.percent ?? -1;
      return bp - ap || String(a.display_name).localeCompare(String(b.display_name));
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      team: { name: team.name, invite_code: team.invite_code, target: team.target, runtime: team.runtime, created_at: team.created_at },
      leaderboard,
    });
  } catch (error) {
    console.error('team_data_failed', error?.data || error?.message || error);
    return res.status(502).json({ error: 'team_data_failed' });
  }
}

import {
  cleanTeamCode,
  supabaseConfig,
  supabaseRpc,
} from '../lib/supabase.js';

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
    const snapshot = await supabaseRpc('apc_team_snapshot', { p_code: code });
    if (!snapshot?.team) return res.status(404).json({ error: 'team_not_found' });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      team: snapshot.team,
      leaderboard: Array.isArray(snapshot.leaderboard) ? snapshot.leaderboard : [],
    });
  } catch (error) {
    console.error('team_data_failed', error?.data || error?.message || error);
    return res.status(502).json({ error: 'team_data_failed' });
  }
}

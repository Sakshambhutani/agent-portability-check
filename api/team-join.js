import {
  cleanDisplayName,
  cleanTeamCode,
  requireSupabaseUser,
  supabaseConfig,
  supabaseRest,
} from '../lib/supabase.js';

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
  const code = cleanTeamCode(input.code);
  if (!code) return res.status(400).json({ error: 'invalid_team_code' });

  try {
    const teams = await supabaseRest('apc_teams', {
      query: `select=id,name,invite_code&invite_code=eq.${encodeURIComponent(code)}&limit=1`,
    });
    const team = Array.isArray(teams) ? teams[0] : null;
    if (!team) return res.status(404).json({ error: 'team_not_found' });

    const displayName =
      cleanDisplayName(input.display_name) ||
      cleanDisplayName(auth.user.user_metadata?.full_name) ||
      cleanDisplayName(auth.user.user_metadata?.name) ||
      '';

    await supabaseRest('apc_team_members', {
      method: 'POST',
      body: {
        team_id: team.id,
        user_id: auth.user.id,
        display_name: displayName || null,
        email: auth.user.email || null,
      },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });

    return res.status(200).json({ ok: true, team });
  } catch (error) {
    console.error('team_join_failed', error?.data || error?.message || error);
    return res.status(502).json({ error: 'team_join_failed' });
  }
}

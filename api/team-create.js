import {
  cleanDisplayName,
  newInviteCode,
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
  const name = cleanDisplayName(input.name) || 'My Agent Team';
  const displayName =
    cleanDisplayName(input.display_name) ||
    cleanDisplayName(auth.user.user_metadata?.full_name) ||
    cleanDisplayName(auth.user.user_metadata?.name) ||
    '';

  try {
    const inviteCode = newInviteCode();
    const teams = await supabaseRest('apc_teams', {
      method: 'POST',
      body: {
        owner_user_id: auth.user.id,
        name,
        invite_code: inviteCode,
      },
      prefer: 'return=representation',
    });
    const team = Array.isArray(teams) ? teams[0] : teams;

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

    const origin = `https://${req.headers.host}`;
    return res.status(200).json({
      ok: true,
      team: {
        id: team.id,
        name: team.name,
        invite_code: inviteCode,
        invite_url: `${origin}/team/${inviteCode}`,
      },
    });
  } catch (error) {
    console.error('team_create_failed', error?.data || error?.message || error);
    return res.status(502).json({ error: 'team_create_failed' });
  }
}

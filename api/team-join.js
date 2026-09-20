import {
  cleanDisplayName,
  cleanTeamCode,
  requireSupabaseUser,
  supabaseConfig,
  supabaseRpc,
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

  const displayName =
    cleanDisplayName(input.display_name) ||
    cleanDisplayName(auth.user.user_metadata?.full_name) ||
    cleanDisplayName(auth.user.user_metadata?.name) ||
    cleanDisplayName(auth.user.user_metadata?.user_name) ||
    '';

  try {
    const team = await supabaseRpc('apc_join_team', {
      p_code: code,
      p_display_name: displayName || null,
    }, { token: auth.token });

    return res.status(200).json({ ok: true, team });
  } catch (error) {
    const detail = String(error?.data?.message || '');
    if (detail.includes('team_not_found')) {
      return res.status(404).json({ error: 'team_not_found' });
    }
    console.error('team_join_failed', error?.data || error?.message || error);
    return res.status(502).json({ error: 'team_join_failed' });
  }
}

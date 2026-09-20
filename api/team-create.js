import { HARNESS_ORDER } from '../src/harnesses.js';
import {
  cleanDisplayName,
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
  const name = cleanDisplayName(input.name) || 'My Agent Team';
  const target = HARNESS_ORDER.includes(input.target) ? input.target : null;
  const runtime = input.runtime === 'cloud' ? 'cloud' : 'local';
  const displayName =
    cleanDisplayName(input.display_name) ||
    cleanDisplayName(auth.user.user_metadata?.full_name) ||
    cleanDisplayName(auth.user.user_metadata?.name) ||
    cleanDisplayName(auth.user.user_metadata?.user_name) ||
    '';

  try {
    const team = await supabaseRpc('apc_create_team', {
      p_name: name,
      p_target: target,
      p_runtime: runtime,
      p_display_name: displayName || null,
    }, { token: auth.token });

    const origin = `https://${req.headers.host}`;
    return res.status(200).json({
      ok: true,
      team: {
        ...team,
        invite_url: `${origin}/team/${team.invite_code}`,
      },
    });
  } catch (error) {
    console.error('team_create_failed', error?.data || error?.message || error);
    return res.status(502).json({ error: 'team_create_failed' });
  }
}

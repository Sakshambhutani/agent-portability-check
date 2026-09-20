const DEFAULT_SUPABASE_URL = "https://mjcuwaydrhzbpspkwhge.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_z3IEgxoGPlJlbV6Ag15aiQ_3EXZVIXW";

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY;

  return {
    url,
    publishableKey,
    configured: Boolean(url && publishableKey),
  };
}

export function publicSupabaseConfig() {
  const { url, publishableKey, configured } = supabaseConfig();
  return {
    configured,
    url,
    anonKey: publishableKey,
  };
}

export function bearer(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

export async function requireSupabaseUser(req) {
  const token = bearer(req);
  const { url, publishableKey } = supabaseConfig();

  if (!url || !publishableKey) {
    return { error: 'supabase_not_configured', status: 503 };
  }
  if (!token) return { error: 'missing_auth', status: 401 };

  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return { error: 'invalid_auth', status: 401 };
  const user = await response.json();
  return { user, token };
}

export async function supabaseRpc(
  functionName,
  body = {},
  { token = '' } = {},
) {
  const { url, publishableKey } = supabaseConfig();
  if (!url || !publishableKey) throw new Error('supabase_not_configured');

  const headers = {
    apikey: publishableKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(
    `${url.replace(/\/$/, '')}/rest/v1/rpc/${functionName}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
  );

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!response.ok) {
    const error = new Error(`supabase_rpc_${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function cleanTeamCode(value) {
  return typeof value === 'string'
    ? value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
    : '';
}

export function cleanDisplayName(value) {
  return typeof value === 'string'
    ? value.trim().replace(/[<>]/g, '').slice(0, 80)
    : '';
}

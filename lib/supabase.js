import crypto from 'node:crypto';

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, anonKey, serviceKey, configured: Boolean(url && anonKey && serviceKey) };
}

export function publicSupabaseConfig() {
  const { url, anonKey, configured } = supabaseConfig();
  return { configured, url, anonKey };
}

function bearer(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

export async function requireSupabaseUser(req) {
  const token = bearer(req);
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) return { error: 'supabase_not_configured', status: 503 };
  if (!token) return { error: 'missing_auth', status: 401 };

  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return { error: 'invalid_auth', status: 401 };
  const user = await response.json();
  return { user, token };
}

export async function supabaseRest(path, { method = 'GET', body = null, query = '', prefer = '' } = {}) {
  const { url, serviceKey } = supabaseConfig();
  if (!url || !serviceKey) throw new Error('supabase_not_configured');
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/${path}${query ? `?${query}` : ''}`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
  };
  if (body !== null) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(endpoint, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(`supabase_rest_${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function newInviteCode() {
  return crypto.randomBytes(9).toString('base64url');
}

export function cleanTeamCode(value) {
  return typeof value === 'string' ? value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) : '';
}

export function cleanDisplayName(value) {
  return typeof value === 'string' ? value.trim().replace(/[<>]/g, '').slice(0, 80) : '';
}

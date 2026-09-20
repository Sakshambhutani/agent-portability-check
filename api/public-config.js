import { publicSupabaseConfig } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const config = publicSupabaseConfig();
  let githubEnabled = false;

  if (config.configured) {
    try {
      const response = await fetch(
        `${config.url.replace(/\/$/, '')}/auth/v1/settings`,
        { headers: { apikey: config.anonKey } },
      );
      if (response.ok) {
        const settings = await response.json();
        githubEnabled = Boolean(settings?.external?.github);
      }
    } catch {}
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ...config,
    githubEnabled,
  });
}

import { publicSupabaseConfig } from '../lib/supabase.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const config = publicSupabaseConfig();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(config);
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    version: '0.8.2',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
  });
}

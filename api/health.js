export default function handler(req, res) {
  const telemetryConfigured = Boolean(process.env.POSTHOG_PROJECT_TOKEN);
  const effectiveHost = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
  res.status(200).json({
    ok: true,
    telemetryConfigured,
    effectiveHost,
  });
}

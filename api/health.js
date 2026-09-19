export default function handler(req, res) {
  const telemetryConfigured = Boolean(process.env.POSTHOG_PROJECT_TOKEN);
  const hostConfigured = Boolean(process.env.POSTHOG_HOST);
  res.status(200).json({
    ok: true,
    telemetryConfigured,
    hostConfigured,
  });
}

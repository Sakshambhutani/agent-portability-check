export default async function handler(req, res) {
  const token = process.env.POSTHOG_PROJECT_TOKEN;
  const effectiveHost = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

  let tokenValid = false;
  let validationStatus = null;

  if (token) {
    try {
      const response = await fetch(`${effectiveHost.replace(/\/$/, '')}/flags?v=2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: token,
          distinct_id: 'agent-portability-health-check',
        }),
      });
      validationStatus = response.status;
      tokenValid = response.ok;
    } catch {
      validationStatus = 0;
    }
  }

  res.status(200).json({
    ok: true,
    telemetryConfigured: Boolean(token),
    effectiveHost,
    tokenValid,
    validationStatus,
  });
}

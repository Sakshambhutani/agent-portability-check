# Deploy the public viral layer

The repository is ready for Vercel.

## One-click deploy

Use Vercel's Git import flow with this repository:

https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSakshambhutani%2Fagent-portability-check&env=POSTHOG_PROJECT_TOKEN,POSTHOG_HOST&envDescription=PostHog%20project%20token%20and%20ingestion%20host&project-name=agent-portability-check&repository-name=agent-portability-check

Set:

- POSTHOG_PROJECT_TOKEN = your PostHog project token
- POSTHOG_HOST = https://us.i.posthog.com

After deployment, take the production URL and run the CLI with:

```bash
APC_PUBLIC_URL=https://YOUR-DEPLOYMENT.vercel.app \
APC_TELEMETRY_ENDPOINT=https://YOUR-DEPLOYMENT.vercel.app/api/telemetry \
npx github:Sakshambhutani/agent-portability-check
```

For public distribution, bake the final production URL into the CLI defaults in a follow-up commit.

## Public routes

- `/` — landing page
- `/r/<ref-id>` — share/result page
- `/api/telemetry` — privacy-filtered PostHog relay

## Privacy

The relay uses an allowlist. Unknown event names and unknown properties are discarded. It never forwards skill names, file paths, instruction contents, repo names, email addresses, or account IDs.

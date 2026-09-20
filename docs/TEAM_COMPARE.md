# Team Compare / Save Result

Team Compare is the optional identified layer after the local scanner has delivered value.

Anonymous scanning does not require an account and does not write to Supabase.

## Live backend

Supabase project:

```text
mjcuwaydrhzbpspkwhge
```

The web app uses only the project URL and **publishable** API key. There is no service-role key in Vercel or source code.

All identified writes use the signed-in user's Supabase JWT and narrowly scoped Postgres RPCs:

- `apc_create_team_v2`
- `apc_join_team`
- `apc_save_result_v2`
- `apc_team_snapshot`

The v2 create/save RPCs add an explicit `mode` field so Team Compare can distinguish a single-target result from an all-harness result without overloading target names. The older create/save RPCs remain in place for backwards compatibility during deployment rollouts.

The first three require an authenticated user. The snapshot function is accessible through the capability-style team invite code and intentionally returns no email address or user ID.

## User flow

```text
local scan
  ↓
fix
  ↓
achievement result
  ↓
Save result / Compare with team
  ↓
explicit email or GitHub sign-in
  ↓
save summary OR create team
  ↓
share team invite
  ↓
teammate joins
  ↓
runs team-attributed local scan
  ↓
saves summary
  ↓
team leaderboard
```

## Authentication

Email magic-link authentication is supported by the UI.

Before using it in production, configure Supabase Auth URL Configuration with:

```text
Site URL:
https://agent-portability-check.vercel.app

Redirect URLs:
https://agent-portability-check.vercel.app/**
```

GitHub OAuth is optional. If enabled in Supabase Auth, the same UI exposes **Continue with GitHub**.

## Data stored

Only after explicit sign-in:

- Supabase auth user ID
- account email inside team membership storage
- optional teammate display name
- team membership
- summary readiness metrics
- target/runtime for single-target checks
- all-harness target counts for `--all` checks
- check mode (`single` or `all`)
- timestamps

Not stored:

- skill names
- file paths
- repository names
- instruction contents
- skill contents
- generated local reports

## Privacy

The team invite URL is a capability link. Anyone with the URL can view the summary leaderboard.

The public leaderboard RPC does not return:

- emails
- Supabase user IDs
- auth metadata

Joining or saving requires a valid authenticated user JWT.

PostHog remains anonymous and does not receive team invite codes, names, emails, or GitHub identities.


## All-harness Team Compare

An all-harness team invite preserves `--all` when a teammate copies the scan command. The leaderboard compares targets-ready / targets-checked rather than pretending those counts are individual skills. Only coarse counts are saved; the per-skill matrix remains local.

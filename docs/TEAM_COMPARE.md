# Team Compare / Save Result

Team Compare is the optional identified layer after the local scanner has delivered value.

Anonymous scanning does not require an account and does not write to Supabase.

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

## Supabase setup

Run:

```sql
supabase/migrations/001_team_compare.sql
```

Configure these Vercel environment variables for Production and Preview:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_PUBLISHABLE_KEY` is also accepted in place of `SUPABASE_ANON_KEY`.

Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.

The browser receives only the public project URL and public/anon key from `/api/public-config`.

## Auth providers

Email magic-link sign-in works through Supabase Auth when email auth is enabled.

The UI also supports GitHub OAuth. Configure GitHub as an Auth provider in the Supabase project and add the production and preview callback URLs allowed by the project.

## Data model

### apc_teams

- owner user ID
- team name
- random invite code
- comparison target
- runtime
- created timestamp

### apc_team_members

- team
- authenticated user ID
- optional display name
- account email
- joined timestamp

### apc_saved_results

Only summary metrics:

- target/runtime
- ready/total
- auto-fix/manual
- context gaps
- dependency blockers
- portable-ready count
- total skill count
- drift count
- completion state
- timestamp

No skill names, file paths, repo names, instruction content, or generated report contents are stored.

## Routes

- `/team/:code` — invite + leaderboard
- `/api/public-config` — public Supabase browser config
- `/api/team-create` — authenticated team creation
- `/api/team-join` — authenticated join
- `/api/team-data` — capability-link leaderboard data
- `/api/save-result` — authenticated result save

## CLI team attribution

A team invite gives a command such as:

```bash
npx github:Sakshambhutani/agent-portability-check --target claude --team ABC123
```

The team code is carried to the public result page so the authenticated user can explicitly choose **Save to team**.

The team code is not sent to PostHog.

## Privacy model

The invite URL is a capability link. Anyone with the link can view the summary leaderboard, but emails are never returned by the team leaderboard API.

Joining or saving requires Supabase authentication.

For a future private-team mode, add an authorization requirement to `/api/team-data` and require membership before returning the leaderboard.

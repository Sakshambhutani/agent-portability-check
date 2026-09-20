# Growth analytics model

Agent Portability Check deliberately separates anonymous product analytics from identified team data.

## Anonymous growth loop — PostHog

Anonymous scans use a random local ID only after analytics opt-in.

The primary funnel is:

```text
apc_landing_viewed
  ↓
apc_command_copied
  ↓
apc_scan_completed
  ↓
apc_fix_previewed
  ↓
apc_fix_applied
  ↓
apc_manual_issues_reviewed (when blockers remain)
  ↓
apc_portable_ready_achieved
  ↓
apc_share_link_generated
  ↓
apc_referral_page_opened
  ↓
apc_referred_scan_completed
```

Target migration adds:

- `apc_target_selected`
- `apc_migration_test_selected`
- target_agent
- target_runtime
- target readiness/auto-fix/manual count buckets
- target_complete

Sharing is achievement-gated and adds:

- `apc_linkedin_share_clicked`
- `apc_x_share_clicked`
- `apc_badge_copied`
- `apc_team_invite_copied`

The team viral loop adds anonymous events only:

```text
apc_team_page_viewed
  ↓
apc_team_joined
  ↓
apc_team_command_copied
  ↓
apc_team_result_saved
```

Do **not** send any of these to PostHog:

- email
- GitHub username
- person name
- team invite code
- skill names
- file paths
- repo names
- instruction or skill contents

## Dashboard to create

Dashboard name: **Agent Portability Viral Loop**

Recommended tiles:

1. **Scans**
   - count of `apc_scan_completed`

2. **Scan → fix rate**
   - funnel: `apc_scan_completed → apc_fix_previewed → apc_fix_applied`

3. **Achievement rate**
   - funnel: `apc_scan_completed → apc_portable_ready_achieved`

4. **Share rate**
   - funnel: `apc_portable_ready_achieved → apc_share_link_generated`

5. **Referral conversion**
   - funnel: `apc_referral_page_opened → apc_referred_scan_completed`

6. **Viral coefficient proxy**
   - referred scans / unique anonymous sharers

7. **Target demand**
   - `apc_target_selected`, breakdown by target_agent and target_runtime

8. **Team activation**
   - funnel: `apc_team_page_viewed → apc_team_joined → apc_team_result_saved`

9. **Manual blocker engagement**
   - funnel: `apc_fix_applied → apc_manual_issues_reviewed → apc_portable_ready_achieved`

10. **Identity conversion**
   - funnel: `apc_identity_cta_clicked → apc_identity_signin_started → apc_result_saved`

## Identified lead loop — Supabase

PostHog remains anonymous.

Identity is captured only after a user explicitly chooses:

- Save result
- Save to team
- Create team / compare with team

The identified data lives in Supabase, not PostHog.

Stored fields are limited to:

- Supabase auth user ID
- email from the authenticated account
- optional display name
- team membership
- summary readiness metrics
- target/runtime
- timestamps

Skill contents, paths, repo names, and full reports are not uploaded.

## Current connector caveat

Before creating the dashboard through the PostHog connector, verify that its active project is the same project receiving the Vercel `POSTHOG_PROJECT_TOKEN`.

If `apc_*` events do not appear in the connected project's event schema, do not create the dashboard there.

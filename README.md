# Agent Portability Check

**Using more than one AI coding environment? Check whether your skills, instructions, MCP tools, and dependencies work across all of them.**

Agent Portability Check covers cross-harness compatibility and runtime changes. Use it when you are switching between Claude Code, Codex, and Cursor, checking local versus cloud behavior, or setting up the same agent workflow on another machine.

Public site: https://agent-portability-check.vercel.app

## 10-second compatibility check

```bash
npx github:Sakshambhutani/agent-portability-check --target claude
```

Targets:

```bash
--target claude
--target codex
--target cursor
```

Example:

```text
TARGET COMPATIBILITY — Claude Code
────────────────────────────────────
Skills checked       7
Ready                3
Auto-fix             3
Manual attention     1
Package-ready        43%
Mode                 migration simulation (target not installed)

✕ incident-response — MANUAL
  Missing companion file: scripts/check.sh

⚡ deploy-prod — AUTO-FIX
  The skill package is valid, but Claude Code cannot discover it
  from its current location.
  Fix: Add a Claude-discoverable adapter in ~/.claude/skills.

✓ code-review — READY
  Claude Code can already discover this valid skill package.
```

## Fix safe issues

```bash
npx github:Sakshambhutani/agent-portability-check --target claude --fix
```

The CLI previews the exact changes and asks before applying anything.

Safe remediation can:

- copy a canonical valid skill package into `~/.agents/skills`
- preserve the **entire skill directory**, including scripts/references/assets
- add a Claude-side discovery adapter when needed
- leave original copies untouched
- refuse to overwrite an existing target
- refuse to auto-resolve drifted copies
- refuse to auto-fix malformed skill packages or missing companion files
- rescan after the fix

Non-interactive use:

```bash
npx github:Sakshambhutani/agent-portability-check --target claude --fix --yes
```

## The product loop

```text
creator / community / shared result
                 ↓
        10-second target scan
                 ↓
       Ready / Auto-fix / Manual
                 ↓
                FIX
                 ↓
          all skills ready
                 ↓
             TROPHY
           ↙        ↘
      social post   README badge
           ↓             ↓
          more people discover
```

Low-readiness result pages lead with **Copy fix command**.

Social sharing and the README badge become primary actions only after a defensible achievement:

- **100% portable-ready**, or
- **all skill packages ready for the selected target**

## What "ready" means

The target simulator checks **skill-package compatibility**, including:

- target discovery location
- valid `SKILL.md` frontmatter
- `name`
- `description`
- lowercase kebab-case names
- folder-name alignment
- missing local companion files under `scripts/`, `references/`, and `assets/`
- same-name drift
- referenced local CLI/interpreter availability
- required environment variable presence (names only; never values)
- explicit MCP server references against target config
- local-only vs Cursor Cloud skill availability
- harness-specific instruction gaps such as `CLAUDE.md`, `AGENTS.md`, and Cursor rules
- whether a location/discovery fix is safe to automate

The result is:

- **Ready**
- **Auto-fix**
- **Manual attention**

See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the current harness assumptions and primary-source documentation.

## What it does not guarantee

A structurally ready skill package can still fail at runtime because of:

- runtime behavior of MCP tools/servers after configuration
- secret values or credential validity
- semantic correctness of external CLIs/language runtimes
- network access
- permissions
- model behavior
- hidden runtime configuration
- cloud-vs-local differences

So the product says **"skills ready for Claude/Codex/Cursor"**, not "the agents will behave identically."

## General portability scan

Without a target:

```bash
npx github:Sakshambhutani/agent-portability-check
```

The CLI separates:

- installed agent tools
- config footprints
- global skills
- project skills
- structurally valid portable-ready skills
- drifted copies
- actual cross-agent availability when 2+ supported agents are installed

## Sharing

Every scan produces:

- a local SVG share card
- a local detailed HTML report
- a local JSON report
- a referral-aware public result URL

After an achievement, the public result page can generate:

- LinkedIn share
- X share
- ready-to-paste post copy
- README badge
- teammate challenge link

## README badge

A successful result page includes **Copy README badge**.

Example:

```md
[![Agent Portability](https://agent-portability-check.vercel.app/api/badge?target=claude&ready=7&total=7)](https://agent-portability-check.vercel.app)
```

## Save result / Team Compare

After a successful result, an optional identified flow can appear:

```text
achievement
  ↓
Save result / Compare with team
  ↓
explicit email or GitHub sign-in
  ↓
create/join team
  ↓
teammates run local scans
  ↓
summary leaderboard
```

The scan itself remains account-free and local. Identity is only requested after an explicit click.

Team Compare uses Supabase and is hidden unless the deployment has all required Supabase environment variables and the migration in [docs/TEAM_COMPARE.md](docs/TEAM_COMPARE.md) has been applied.

Anonymous growth analytics and the exact PostHog funnel are documented in [docs/ANALYTICS.md](docs/ANALYTICS.md).


## Resumable CLI journey

Every interactive scan now creates a private local session under:

```text
~/.agent-portability/sessions/
```

The session stores progress and summary state only. It does not upload skill names or contents.

If a user leaves midway, the next plain run offers to resume:

```text
Welcome back.
Last check: 3 / 7 ready for claude

[R] Resume
[V] View previous result
[N] New check
```

Explicit resume:

```bash
npx github:Sakshambhutani/agent-portability-check --resume
```

After a normal scan the terminal becomes the primary action surface:

```text
[F] Fix now
[T] Test migration
[V] View result
[Q] Continue later
```

After an achievement, the CLI offers to open the trophy directly in the browser. If the user declines, the trophy remains attached to the local session and can be reopened with `--resume`.

## Short public result URLs

The CLI sends only coarse summary metrics to the result service and receives a short random result ID:

```text
https://agent-portability-check.vercel.app/r/AbC123xyz
```

The stored public summary does not contain skill names, file paths, repository names, instruction contents, or skill contents. Long self-contained result URLs remain as an offline fallback if publishing is unavailable.

The browser remembers the last result URL in localStorage for 30 days, so returning visitors can reopen an unfinished result or trophy.

## Privacy

Scanning and fixing happen locally.

Anonymous analytics are opt-in and send only coarse product events/buckets. They do **not** send:

- skill names
- file paths
- skill or instruction contents
- repository names
- email addresses
- GitHub usernames
- account IDs

Manage analytics:

```bash
npx github:Sakshambhutani/agent-portability-check --analytics status
npx github:Sakshambhutani/agent-portability-check --analytics on
npx github:Sakshambhutani/agent-portability-check --analytics off
```

## Viral funnel events

The public/CLI flow can emit anonymous events such as:

- `apc_landing_viewed`
- `apc_target_selected`
- `apc_command_copied`
- `apc_scan_completed`
- `apc_fix_previewed`
- `apc_fix_command_copied`
- `apc_fix_applied`
- `apc_portable_ready_achieved`
- `apc_share_link_generated`
- `apc_referral_page_opened`
- `apc_badge_copied`
- `apc_referred_scan_completed`

## Options

```text
-p, --path <dir>       Project to scan
-o, --output <dir>     Report folder
    --target <agent>    claude | codex | cursor
    --fix              Preview/apply safe fixes
-y, --yes              Apply --fix without confirmation
    --ref <id>          Attribute a referred scan
    --json              Print report JSON
    --no-write          Don't create report files
    --analytics <mode>  on | off | status
-h, --help              Show help
```

## Development

```bash
git clone https://github.com/Sakshambhutani/agent-portability-check.git
cd agent-portability-check
npm test
```

GitHub Actions tests the public seams on Node 18 and 20. A production health workflow verifies the Vercel telemetry relay and PostHog project token.

## License

MIT

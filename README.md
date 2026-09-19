# Agent Portability Check

**Switching AI agents? See which skills will carry over, what can be fixed automatically, and what needs manual attention.**

Public site: https://agent-portability-check.vercel.app

## 10-second migration check

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
- whether a location/discovery fix is safe to automate

The result is:

- **Ready**
- **Auto-fix**
- **Manual attention**

See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the current harness assumptions and primary-source documentation.

## What it does not guarantee

A structurally ready skill package can still fail at runtime because of:

- MCP tools/servers
- environment variables or credentials
- external CLIs/language runtimes
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

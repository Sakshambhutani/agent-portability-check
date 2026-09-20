# Agent Portability Check

**Using more than one AI coding environment? Check whether your skills, instructions, MCP tools, and dependencies work across all of them.**

Agent Portability Check covers cross-harness compatibility and runtime changes. It verifies user-controlled skills across Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, OpenCode, and Roo Code, with cloud-runtime checks for Cursor and GitHub Copilot.

Public site: https://agent-portability-check.vercel.app

## Use it inside your agent harness

The CLI is the deterministic verifier. The `agent-portability` skill lets an AI harness inspect the report, investigate ambiguous blockers, make evidence-backed repairs, and then re-run the checker.

Install the skill with the Skills CLI:

```bash
npx skills add https://github.com/Sakshambhutani/agent-portability-check --skill agent-portability
```

Then ask your harness naturally:

```text
Make my agent setup portable to Claude.
```

or:

```text
Check whether my skills work across Claude, Codex, Cursor, Gemini, Copilot, OpenCode, and Roo and fix what you safely can.
```

The repository is also packaged as:
- a portable Agent Plugin via `plugin.json` for ChatGPT/Codex plugin packaging;
- a Claude Code plugin via `.claude-plugin/plugin.json`;
- a repository marketplace entry under `.agents/plugins/marketplace.json`.

Claude Code can test the repository directly:

```bash
git clone https://github.com/Sakshambhutani/agent-portability-check.git
claude --plugin-dir ./agent-portability-check
```

The plugin skill is then namespaced in Claude Code as `/agent-portability:agent-portability`.

Public directory discovery still requires the normal provider review/submission step. The repository is packaged so the same skill can be submitted without creating a separate implementation for each harness.

Important runtime distinction:

- In **any supported local agent runtime with filesystem + shell access**, the skill can scan and repair the machine directly.
- In a **ChatGPT surface without access to the user's local filesystem**, the skill must not pretend it changed the laptop. It can guide the user to run the local checker and interpret the private JSON result.
- Intermediate intelligent scans use `--no-publish`; the final verified result can create the share/team page.

## 10-second compatibility check

Check one target:

```bash
npx github:Sakshambhutani/agent-portability-check --target claude
```

Check everything in one run:

```bash
npx github:Sakshambhutani/agent-portability-check --all
```

`--all` produces one target summary plus a skill × harness matrix for Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, OpenCode, Roo Code, Cursor Cloud, and GitHub Copilot Cloud Agent.

Targets:

```bash
--target claude
--target codex
--target cursor
--target gemini
--target copilot
--target opencode
--target roo

# Cloud-runtime checks
--target cursor --runtime cloud
--target copilot --runtime cloud
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
- add harness-specific discovery adapters when the target needs one
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
          FIX safe issues
                 ↓
     REVIEW manual blockers
                 ↓
          all skills ready
                 ↓
             TROPHY
        ↙        ↓        ↘
 social post  teammate   README badge
               challenge
                 ↓
          teammate scans
                 ↓
           Team Compare
```

Low-readiness result pages lead with **Copy fix command**.

Social sharing and the README badge become primary actions only after a defensible achievement:

- **100% portable-ready**, or
- **all user-controlled skill packages ready for the selected target**

Harness-managed skills under directories such as `.codex/skills/.system` are reported separately and excluded from readiness. They belong to the harness, so a user should not fail portability because a bundled system skill references files that are not portable.

Target achievements are intentionally narrow: **skill packages ready for <target>**. Harness-specific instruction/context gaps can still be shown separately without suppressing a genuine 100% skill-package result.

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
- local-only vs cloud-runtime skill availability
- harness-specific instruction gaps such as `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, Copilot instructions, Cursor rules, OpenCode instructions, and Roo rules
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

So the product says **"skill packages ready for <target>"**, not "the agents will behave identically."

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

- a local SVG diagnostic card
- a local detailed HTML report
- a local JSON report
- a referral-aware public diagnostic URL

Before achievement, the page is a **diagnostic**: it leads with fixing, keeps public social-share controls locked, but still allows Team Compare so multiple teammates can run the same diagnostic.

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

Team Compare is available from **any diagnostic**, not only a trophy. This is a separate viral loop from public social sharing.

The identified flow appears only after the user explicitly chooses to save/group results:

```text
diagnostic or achievement
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

The scan itself remains account-free and local. Identity is only requested after an explicit click. A low-readiness user can therefore compare the same diagnostic across teammates even when LinkedIn/X sharing is still locked.

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

After a normal scan the terminal becomes the primary action surface. The choices depend on state:

```text
Safe fixes remain:
[F] Fix now  [T] Test migration  [V] View diagnostic  [Q] Continue later

Automatic fixes exhausted:
[R] Review issues  [T] Test migration  [V] View diagnostic  [Q] Continue later
```

Selecting **Review issues** prints the exact package blocker when possible (for example missing frontmatter/description, folder mismatch, or missing companion file).

A partial fix immediately returns to this next-step state; users do not need to run `--resume` just to continue the journey.

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
- `apc_manual_issues_reviewed`
- `apc_migration_test_selected`
- `apc_portable_ready_achieved`
- `apc_share_link_generated`
- `apc_referral_page_opened`
- `apc_badge_copied`
- `apc_referred_scan_completed`

## Options

```text
-p, --path <dir>       Project to scan
-o, --output <dir>     Report folder
    --target <agent>    claude | codex | cursor | gemini | copilot | opencode | roo
    --all               Check all supported local + cloud harness surfaces
    --runtime <mode>    local | cloud (Cursor / Copilot cloud targets)
    --team <code>       Attach an explicitly joined team invite
    --resume [id]       Resume latest or named local session
    --fix              Preview/apply safe fixes
-y, --yes              Apply --fix without confirmation
    --ref <id>          Attribute a referred scan
    --json              Print report JSON
    --no-write          Don't create report files
    --no-publish        Don't create a public result URL
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

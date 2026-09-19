# Agent Portability Check

**Scan your AI setup, improve it, and make your skills portable-ready across agent tools.**

Run:

```bash
npx github:Sakshambhutani/agent-portability-check
```

## The loop

```text
scan
  ↓
see what's not portable-ready
  ↓
--fix
  ↓
safe preview + confirmation
  ↓
rescan
  ↓
100% PORTABLE-READY
  ↓
share the achievement
```

Low-readiness result pages prioritize **Improve my setup**. Social sharing becomes the primary action after the setup reaches the achievement state.

## Scan

The CLI separates:

1. **Agent tools detected** — Codex, Claude Code, and Cursor based on CLI/app/IDE-extension evidence.
2. **Global setup** — user-level skills on the machine.
3. **This project** — skills and instructions inside the directory being scanned.
4. **Portable readiness** — how many unique global skills have a canonical shared-format copy.
5. **Cross-agent portability** — when 2+ supported agents are actually installed, how many skills are available to all of them.

A `.codex`, `.claude`, or `.cursor` folder by itself is a **config footprint**, not proof that the tool is installed.

## Improve the setup

Preview safe changes:

```bash
npx github:Sakshambhutani/agent-portability-check --fix
```

The fixer is deliberately conservative:

- copies a canonical version into `~/.agents/skills/`
- copies the **entire skill directory**, including scripts/references/assets
- leaves the original skill untouched
- does not overwrite an existing target
- does not auto-resolve same-name skills whose contents differ
- creates a Claude-side symlink adapter when Claude Code is detected and needs one
- rescans after changes are applied
- unlocks the **100% PORTABLE-READY** result when all global skills are in shared format

For automation/non-interactive use:

```bash
npx github:Sakshambhutani/agent-portability-check --fix --yes
```

## Current skill-location model

The tool scans these locations because they are useful for migration/compatibility analysis:

### Global

- `~/.agents/skills/`
- `~/.claude/skills/`
- `~/.cursor/skills/`
- `~/.codex/skills/` when present

### Current project

- `./.agents/skills/`
- `./.claude/skills/`
- `./.cursor/skills/`
- `./.codex/skills/` when present

For current Codex, `~/.agents/skills` is the canonical user-level skills location. Cursor supports `.agents/skills` as well as Cursor-specific and compatibility skill directories. Harness-specific directories are still scanned so existing setups can be diagnosed and migrated.

## Result behavior

### One agent installed

Instead of inventing a cross-agent percentage, the share result focuses on **portable readiness**:

```text
0 / 7
skills in shared format

Codex setup · 7 global skills

→ Improve my setup
```

After fixing:

```text
100%
PORTABLE-READY

7 / 7 skills in shared format
0 drifted
```

That achievement page unlocks the share-first experience.

### Two or more agents installed

The tool can also show actual cross-agent availability:

```text
Portable readiness   100%
Cross-agent score     75%

6 / 8 skills available to every detected agent
```

These are deliberately different concepts.

## Reports

Each scan creates:

- `.agent-portability/agent-portability-card.svg`
- `.agent-portability/agent-portability-report.html`
- `.agent-portability/agent-portability-report.json`

The terminal also prints a clickable public share page plus the raw URL as a fallback.

## Viral/referral flow

Public site:

https://agent-portability-check.vercel.app

Each scan gets a referral-aware result URL.

```text
achievement
  ↓
share result
  ↓
friend clicks Check yours
  ↓
referral-aware CLI command
  ↓
referred scan
```

The landing page also supports the remediation route, so **Improve my setup** produces a command containing `--fix`.

## Anonymous analytics

Analytics are opt-in. The CLI can send coarse events through the Vercel relay to PostHog, including:

- scan completed
- fix previewed
- fix applied
- portable-ready achieved
- share link generated
- share page opened
- share clicked
- referred scan completed

Properties are coarse/bucketed, including detected agents, skill-count buckets, score/readiness buckets, and drift counts.

The analytics path does **not** send:

- skill names
- file paths
- skill/instruction contents
- repository names
- emails
- GitHub usernames
- account IDs

Manage consent:

```bash
npx github:Sakshambhutani/agent-portability-check --analytics status
npx github:Sakshambhutani/agent-portability-check --analytics on
npx github:Sakshambhutani/agent-portability-check --analytics off
```

## Options

```text
-p, --path <dir>       Project to scan
-o, --output <dir>     Report folder
    --json             Print full report JSON
    --no-write         Don't create report files
    --analytics <mode> on | off | status
    --ref <id>         Attribute a referred scan
    --fix              Preview/apply portable-ready fixes
-y, --yes              Apply --fix without confirmation
-h, --help             Show help
```

## Privacy and limitations

Scanning and fixing happen locally.

The fixer changes filesystem layout, not model behavior. A portable skill file does **not** guarantee identical behavior across different models, tools, MCP servers, permissions, environments, or runtime state.

The detailed local HTML/JSON reports contain paths, so review them before sharing. The public result/share page only receives summary metrics.

## Development

```bash
git clone https://github.com/Sakshambhutani/agent-portability-check.git
cd agent-portability-check
npm test
```

GitHub Actions tests every push and pull request. Production health checks verify the Vercel telemetry relay and PostHog token configuration.

## License

MIT

# Agent Portability Check

**How portable is my AI setup across the agents I actually use?**

Run one command from any project folder:

```bash
npx github:Sakshambhutani/agent-portability-check
```

V0.3 separates three things that earlier versions mixed together:

1. **Agent tools detected** — Codex, Claude Code, and Cursor based on CLI/app/IDE-extension evidence.
2. **Global setup** — skills in your home-level agent folders.
3. **This project** — skills and instructions inside the folder where you run the command.

A `.codex`, `.claude`, or `.cursor` folder by itself is treated as a **config footprint**, not proof that the tool is installed.

## Example: one agent installed

```text
Agent tools detected
✓ Codex (ide-extension)
✕ Claude Code
✕ Cursor

GLOBAL SETUP
Skills              7
Shared-format       0 / 7
Cross-agent score   N/A (need at least 2 detected agents)
```

We intentionally do **not** show a 0% portability score when there is only one agent to compare.

## Example: Codex + Claude Code

```text
GLOBAL SETUP
Skills              8
Shared-format       1 / 8
Across all agents   5 / 8
Portability score   63%
Drifted copies      0
```

The headline score answers one narrow question:

> **What share of my unique global skills are available across every supported agent detected on this machine?**

## Detection

V0.3 checks for:

- **Codex:** `codex` CLI or the OpenAI Codex VS Code-family extension (`openai.chatgpt`)
- **Claude Code:** `claude` CLI or the Claude Code VS Code-family extension (`anthropic.claude-code`)
- **Cursor:** Cursor app/launcher or Cursor Agent CLI (`agent`)

It also shows config footprints separately, such as `~/.codex`, `~/.claude`, `~/.cursor`, or project-level equivalents.

## Skills scanned

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

The tool keeps **global** and **project** skills separate in both the terminal output and detailed report.

## Scoring

A skill counts as portable across the detected agents when either:

- there is one non-drifted copy in `.agents/skills`, or
- identical copies exist in the native skill locations of every detected agent.

Same-name copies with different hashes are flagged as drift and do not count as portable.

The score is only shown when at least **two supported agents** are detected.

## Reports

The tool creates:

- `.agent-portability/agent-portability-card.svg` — shareable summary card
- `.agent-portability/agent-portability-report.html` — detailed local report
- `.agent-portability/agent-portability-report.json` — machine-readable output

## Privacy

Scanning and report generation happen locally. Skill and instruction contents are read only to compute hashes; generated reports store **paths and hashes, not the text itself**.

Review the detailed HTML/JSON before sharing because local paths can still be sensitive. The SVG card contains summary information only.

## Options

```text
-p, --path <dir>     Project to scan (default: current directory)
-o, --output <dir>   Report folder (default: .agent-portability)
    --json           Print report JSON
    --no-write       Don't create report files
-h, --help           Show help
```

## Development

```bash
git clone https://github.com/Sakshambhutani/agent-portability-check.git
cd agent-portability-check
npm test
```

## Important limitation

File portability does not guarantee identical agent behavior. Models, tools, MCP servers, permissions, runtime state, hidden product configuration, and environment differences can still change outcomes.

## License

MIT

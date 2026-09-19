# Agent Portability Check

**How portable is your AI setup across Claude Code, Codex, and Cursor?**

One command scans the agent skills and instruction footprints it can see on your machine, gives you an **experimental skill portability score**, and generates a shareable card.

```bash
npx github:Sakshambhutani/agent-portability-check
```

> V0.2 is local and deterministic. It does **not** upload your skill or instruction contents.

## What the score now means

The score answers one narrow question:

> **How reusable are my unique skills across agent harnesses without manually rebuilding them?**

For each unique skill:

- shared `.agents/skills` location = **100%**
- identical copies across all three supported harnesses = **100%**
- identical copies across two harnesses = **50%**
- only one harness-specific copy = **0%**
- same-name copies with different contents = **0%**

Your final score is the average across your unique skills.

If no skills are found, the score is shown as **N/A** rather than inventing a number.

## Example

```text
Agent Portability Check
────────────────────────────────────
PORTABILITY SCORE   0 / 100
Harness footprints  Codex
Unique skills       7
Cross-harness       0 / 7
Fully portable      0 / 7
Drifted copies      0

✕ None of your 7 skills are currently reusable across multiple harnesses.
• Only Codex has a harness-specific footprint in the locations checked.
```

It also creates:

- `.agent-portability/agent-portability-card.svg` — summary card designed to share
- `.agent-portability/agent-portability-report.html` — detailed local report
- `.agent-portability/agent-portability-report.json` — machine-readable output

## What V0.2 checks

### Skills

- `.agents/skills/` and `~/.agents/skills/`
- `.claude/skills/` and `~/.claude/skills/`
- `.cursor/skills/` and `~/.cursor/skills/`
- `.codex/skills/` and `~/.codex/skills/`

It identifies same-name duplicates, compares hashes, and distinguishes shared, cross-harness, harness-specific, and drifted copies.

### Instructions and harness footprints

- `AGENTS.md`
- `CLAUDE.md`
- `~/.codex/AGENTS.md`
- `~/.claude/CLAUDE.md`
- `.cursor/rules/*.mdc`
- presence of `.claude`, `.codex`, and `.cursor` directories

A shared `AGENTS.md` no longer causes the CLI to claim that both Codex and Cursor are installed. Harnesses are only listed when harness-specific evidence is found.

## Privacy

The scanner reads local filenames and the contents needed to compute hashes, but generated reports store **hashes and paths, not the instruction or skill text itself**. Nothing is uploaded by the CLI.

Review the detailed HTML/JSON report before sharing it because file paths can still be sensitive. The SVG share card contains summary information only.

## Options

```text
-p, --path <dir>     Project to scan (default: current directory)
-o, --output <dir>   Report folder (default: .agent-portability)
    --json           Print report JSON
    --no-write       Don't create report files
-h, --help           Show help
```

## Run locally from source

```bash
git clone https://github.com/Sakshambhutani/agent-portability-check.git
cd agent-portability-check
npm test
node src/index.js --help
```

## What this score does not claim

Identical files do not guarantee identical agent behavior. Model choice, runtime state, permissions, tools, MCP servers, hidden product configuration, and environment differences can change outcomes.

This is deliberately a **portability check**, not a model-quality or reliability score.

## Next ideas

- compare two teammates' exported setup fingerprints
- detect broken skill references and missing companion files
- inspect MCP/config portability without leaking secrets
- generate PNG/social cards
- give one-click fixes for common portability findings

## License

MIT

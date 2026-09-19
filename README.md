# Agent Portability Check

**How portable is your AI setup across Claude Code, Codex, and Cursor?**

One command scans the agent instructions and skills it can see on your machine, gives you an **experimental portability score**, and generates a shareable card.

```bash
npx github:Sakshambhutani/agent-portability-check
```

> V0 is intentionally local and deterministic. It does **not** upload your skill or instruction contents.

## Example

```text
Agent Portability Check
────────────────────────────────────
PORTABILITY SCORE   64 / 100
Harnesses detected  Claude, Codex, Cursor
Unique skills       12
Harness-specific    4
Drifted copies      2

✕ 2 skills have different copies with the same name.
⚠ 4 skills live only in one harness-specific location.
⚠ 3 Cursor rules may not travel to Claude or Codex as-is.
```

It also creates:

- `.agent-portability/agent-portability-card.svg` — designed to share
- `.agent-portability/agent-portability-report.html` — detailed local report
- `.agent-portability/agent-portability-report.json` — machine-readable output

## What V0 checks

### Skills

- `.agents/skills/` and `~/.agents/skills/`
- `.claude/skills/` and `~/.claude/skills/`
- `.cursor/skills/` and `~/.cursor/skills/`
- `.codex/skills/` and `~/.codex/skills/` when present

It identifies same-name duplicates and flags copies whose `SKILL.md` contents differ.

### Instructions

- `AGENTS.md`
- `CLAUDE.md`
- `~/.codex/AGENTS.md`
- `~/.claude/CLAUDE.md`
- project/user `.cursor/rules/*.mdc`

## What the score means

The score is an **experiment, not a standard**. It penalizes obvious portability risks such as:

- a skill existing only in a harness-specific location
- multiple different copies of the same skill
- duplicated skill copies
- Cursor-only rule files
- a multi-harness setup with only one project instruction format

The tool does **not** claim that identical files guarantee identical model behavior. Model choice, runtime state, permissions, tools, MCP servers, and hidden/product-level configuration can all change outcomes.

## Privacy

The scanner reads local filenames and the contents needed to compute hashes, but the generated report stores **hashes and paths, not the instruction/skill text itself**. Nothing is uploaded by this CLI.

Review the detailed HTML/JSON report before sharing it because file paths can still be sensitive. The SVG share card contains summary counts only.

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

## V0.2 ideas

- compare two teammates' exported setup fingerprints
- detect broken skill references and missing companion files
- inspect MCP/config portability without leaking secrets
- generate PNG/social cards
- explain exactly how to make one finding more portable

## Why this exists

AI workflows are increasingly made of more than a model: skills, instructions, rules, tools, and context shape how an agent behaves. Those pieces often live in different places across harnesses.

This project asks one deliberately simple question:

> **Could another agent setup reproduce the context you rely on?**

If your score surprises you, share the card and ask a teammate to check theirs.

## License

MIT

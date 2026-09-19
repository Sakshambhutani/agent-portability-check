# Compatibility model

Agent Portability Check answers a narrow migration question:

> **Will this skill package be discoverable and structurally usable by the target harness, and if not, can the layout problem be fixed safely?**

It does **not** claim that two different agents will behave identically.

## Current checks

For every discovered skill package the target simulator checks:

- whether the target harness can discover the current skill location
- YAML frontmatter exists
- `name` exists and is lowercase kebab-case
- `description` exists
- folder name matches skill name
- local companion files referenced under `scripts/`, `references/`, or `assets/` exist
- same-name copies have not drifted
- whether a location/discovery issue can be auto-fixed without overwriting existing files

Results are one of:

- **Ready** — target can discover a structurally valid package
- **Auto-fix** — package is valid but needs a safe location/adapter change
- **Manual** — conflict, malformed metadata, or missing companion file requires a human choice

## Harness location assumptions

These are intentionally isolated from the scoring language so they can change as harnesses evolve.

### Codex

Canonical user-level skills are discovered from:

- `~/.agents/skills`

Project-level shared skills can live in:

- `.agents/skills`

Primary source:
- https://developers.openai.com/codex/skills/
- https://developers.openai.com/codex/skills/create-skill/

### Claude Code

Personal skills are discovered from:

- `~/.claude/skills`

Project skills are discovered from:

- `.claude/skills`

Primary source:
- https://docs.anthropic.com/en/docs/claude-code/skills
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

### Cursor

Cursor supports its own skill directories and compatibility locations, including Agent Skills directories and skill locations used by other common harnesses.

Primary source:
- https://docs.cursor.com/context/skills
- https://cursor.com/docs/skills

## What is not checked yet

A **Ready** skill package can still fail at runtime because of dependencies outside the skill package, including:

- MCP servers/tools
- required environment variables or secrets
- shell binaries or language runtimes invoked by scripts
- network access
- filesystem permissions
- target-specific tool names/APIs
- model behavior
- hidden runtime configuration
- cloud-vs-local execution differences

These are future compatibility layers. Until implemented, public copy should say **"skills ready for <target>"** or **"skill-package readiness"**, not "your whole setup will work identically."

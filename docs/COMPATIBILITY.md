# Compatibility model

Agent Portability Check answers a narrow migration question:

> **Will this skill package be discoverable and structurally usable by the target harness, and if not, can the layout problem be fixed safely?**

It does **not** claim that two different agents will behave identically.

## Current checks

Harness-managed system skills (for example skills under `.codex/skills/.system`) are detected but excluded from user portability scoring and target readiness. They are owned by the harness rather than the user and may legitimately depend on private/bundled companion files.

For every user-controlled discovered skill package the target simulator checks:

- whether the target harness can discover the current skill location
- YAML frontmatter exists
- `name` exists and is lowercase kebab-case
- `description` exists
- folder name matches skill name
- local companion files referenced under `scripts/`, `references/`, or `assets/` exist
- same-name copies have not drifted
- referenced local CLI/interpreter availability
- required environment variable presence (names only; values are never uploaded)
- explicit MCP server references against the selected target's config
- local-only versus repository-visible skills for Cursor Cloud
- harness-specific instruction gaps such as `CLAUDE.md`, `AGENTS.md`, and Cursor rules
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

## What is not guaranteed

The checker validates discoverability and several concrete dependency signals, but a **Ready** result can still fail at runtime. It does not validate:

- whether a configured MCP server actually works after connection
- secret values or credential validity
- semantic behavior of external CLIs/language runtimes
- network access
- filesystem or service permissions
- target-specific API/tool behavior that is not explicitly referenced
- model behavior
- hidden runtime configuration

Cursor Cloud checks are intentionally conservative: local CLI installs and local environment variables do not prove cloud availability, so they are surfaced as setup requirements rather than treated as ready.

Public copy should therefore say **"skills ready for <target>"**, **"portable-ready"**, or **"migration-ready"**, not "your agents will behave identically."

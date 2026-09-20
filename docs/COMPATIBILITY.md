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
- local-only versus repository-visible skills for supported cloud runtimes
- harness-specific instruction gaps such as `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, Copilot instructions, Cursor rules, OpenCode instructions, and Roo rules
- whether a location/discovery issue can be auto-fixed without overwriting existing files

Results are one of:

- **Ready** — target can discover a structurally valid package
- **Auto-fix** — package is valid but needs a safe location/adapter change
- **Manual** — conflict, malformed metadata, or missing companion file requires a human choice

## All-harness mode

`--all` runs the same deterministic target analysis across all supported surfaces in one pass:

- Claude Code
- Codex
- Cursor
- Gemini CLI
- GitHub Copilot
- OpenCode
- Roo Code
- Cursor Cloud
- GitHub Copilot Cloud Agent

The consolidated output includes a target summary and a skill × harness matrix. An all-harness package achievement requires every target surface to have no skill-package auto-fix or manual blockers. Context warnings remain separate and do not imply behavior equivalence.

`--all --fix` applies only deterministic shared-package/discovery fixes. It does not automatically promote personal skills into a repository for cloud runtimes, invent secrets, or rewrite ambiguous harness-specific instructions.

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

### Gemini CLI

Gemini CLI supports the Agent Skills format in both native Gemini and interoperable locations:

- global: `~/.gemini/skills`, `~/.agents/skills`
- project: `.gemini/skills`, `.agents/skills`

Persistent context defaults to `GEMINI.md`; MCP servers are configured through Gemini settings.

Primary source:
- https://geminicli.com/docs/cli/skills/
- https://geminicli.com/docs/cli/gemini-md/

### GitHub Copilot

Copilot supports Agent Skills through interoperable and Copilot-specific locations:

- global: `~/.agents/skills`, `~/.copilot/skills`
- project: `.agents/skills`, `.github/skills`

Repository instructions can use `AGENTS.md`, `.github/copilot-instructions.md`, and path-specific instructions. Cloud-agent checks require repository-visible skills.

Primary source:
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills

### OpenCode

OpenCode supports:

- global: `~/.agents/skills`, `~/.config/opencode/skills`
- project: `.agents/skills`, `.opencode/skills`

It also supports `AGENTS.md` and structured MCP configuration.

Primary source:
- https://opencode.ai/docs/skills
- https://opencode.ai/docs/rules

### Roo Code

Roo Code supports:

- global: `~/.agents/skills`, `~/.roo/skills`
- project: `.agents/skills`, `.roo/skills`
- mode-specific skill roots such as `.roo/skills-code`

Roo-specific rules and mode-specific rules are surfaced separately rather than flattened into generic portability.

Primary source:
- https://roocodeinc.github.io/Roo-Code/features/skills/

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

Cloud checks are intentionally conservative: local CLI installs, personal skills, environment variables, and MCP availability do not prove cloud availability. Cursor Cloud and GitHub Copilot Cloud Agent therefore require repository-visible skills and surface cloud dependencies separately.

Public copy should therefore say **"skills ready for <target>"**, **"portable-ready"**, or **"migration-ready"**, not "your agents will behave identically."

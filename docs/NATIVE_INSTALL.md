# Native Claude and ChatGPT installation

Agent Portability is packaged as a skills-only plugin so the same workflow can be installed through Claude, Claude Cowork, ChatGPT, Codex, or the Skills CLI without maintaining separate implementations.

## Skills.sh / Skills CLI

Install the **individual Agent Portability skill** directly from the public GitHub repository:

```bash
npx skills@latest add https://github.com/Sakshambhutani/agent-portability-check --skill agent-portability
```

This is the canonical Skills CLI distribution path. The source remains:

```text
skills/agent-portability/SKILL.md
```

A Skills.sh pack may still be used as an optional bundle/share link, but it is not required for this single skill and should not be treated as the primary install path.

Update an existing Skills CLI installation with:

```bash
npx skills update agent-portability
```

## Claude / Cowork

The repository includes:

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `skills/agent-portability/SKILL.md`

### Add from GitHub

In Claude or Cowork:

1. Open **Customize**.
2. Open **Plugins**.
3. Add a marketplace from a repository.
4. Use:
   `https://github.com/Sakshambhutani/agent-portability-check`
5. Install **Agent Portability** from the **Agent Labs** marketplace.

Claude Code can use the same marketplace:

```text
/plugin marketplace add https://github.com/Sakshambhutani/agent-portability-check
/plugin install agent-portability@agent-labs
```

After installation, start from a representative request:

```text
Check whether my setup is portable across all harnesses and fix what you safely can.
```

For the full local workflow in Cowork, connect the project folder and use a surface that can access that folder and execute shell commands. If the current Claude session cannot reach the local filesystem, the skill falls back to the private local checker command instead of pretending it scanned the machine.

## ChatGPT / Codex

The repository includes:

- portable root `plugin.json`
- `.codex-plugin/plugin.json` compatibility metadata
- `.agents/plugins/marketplace.json`
- `skills/agent-portability/SKILL.md`

### Workspace GitHub import

For an eligible ChatGPT workspace administrator:

1. Open **Workspace settings → Plugins**.
2. Choose **Add → Import marketplace**.
3. Source:
   `https://github.com/Sakshambhutani/agent-portability-check`
4. Leave **Path** empty because the marketplace is at the repository root.
5. Use the default branch (`main`) so future repository changes can sync.
6. Import the marketplace and make **Agent Portability** available to the intended roles.

### ChatGPT Desktop / Codex repository marketplace

When the repository is opened locally in a supported ChatGPT Desktop Work or Codex environment, `.agents/plugins/marketplace.json` exposes **Agent Portability** as a repository plugin source. Install it from the local plugin directory, then test it in a new conversation.

## What works on each surface

The plugin itself is instructions-only. It does not bundle an MCP server, so installing it does not make the plugin Desktop-only.

The full scan/fix flow requires two capabilities from the host:

1. access to the user's project/home skill files;
2. permission to run the local checker with Node/npm.

When both are available, the harness runs the deterministic checker itself. When either is missing, the skill provides the local `npx` command and interprets the returned JSON/output.

## Canonical source

`skills/agent-portability/SKILL.md` is the canonical workflow. Claude and OpenAI plugin packaging both point to the same skill directory. Do not fork the instructions into separate Claude and ChatGPT copies.

## Freshness

GitHub `main` is the source of truth.

- GitHub-managed plugin marketplaces can sync repository updates.
- Local installed plugin copies may require a plugin refresh/reinstall depending on the host.
- Skills CLI installs update with:
  `npx skills update agent-portability`


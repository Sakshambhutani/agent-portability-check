---
name: agent-diagnostic
description: Diagnose whether an AI agent can actually run in a specific harness or runtime by tracing skills, instructions, MCP servers, tools and CLIs, environment variables, connections, authentication and permissions, and runtime reachability. Use when an agent works in one harness but not another, a tool or MCP appears configured but fails, or the user wants a dependency and access health check.
---

# Agent Diagnostic

Diagnose runtime readiness, not just configuration presence.

## Core rule

Keep these states separate:

1. **Declared** — the agent or skill references the dependency.
2. **Configured** — a harness configuration contains it.
3. **Available** — the executable, MCP, connector, or service can be reached.
4. **Authorized** — the current identity has the permission needed for the requested action.
5. **Verified** — a safe runtime check demonstrated that it works.

Never turn "configured" into "authorized" or "working" without evidence.

## Start with the deterministic scan

If local filesystem and shell access are available, run a private diagnostic first.

All supported harnesses:

```bash
npx github:Sakshambhutani/agent-portability-check --all --json --no-write --no-publish
```

Specific target:

```bash
npx github:Sakshambhutani/agent-portability-check --target <target> --json --no-write --no-publish
```

Use the JSON to establish skill discovery, instruction/context gaps, referenced CLIs, environment-variable names, and MCP configuration.

If local execution is unavailable, do not imply the machine was inspected. Ask the user to run the smallest relevant command and return the JSON.

## Build the dependency graph

For each relevant agent or skill, trace:

```text
agent
  → instructions / prompt
  → skills
  → scripts / local files
  → CLIs / runtimes
  → MCP servers / tools
  → environment-variable names
  → external connections
  → permission / auth requirements
  → harness + runtime
```

Do not expose secret values. Record only secret or environment-variable names and whether they appear present.

## Check permissions and connections

The checker can prove that some dependencies are referenced or configured; that does not prove authorization.

For each MCP/tool/connector, report one of:

- **verified** — a safe read-only probe succeeded;
- **configured-unverified** — configuration exists but runtime access was not tested;
- **blocked** — a concrete permission, auth, scope, connection, or reachability failure was observed;
- **missing** — the required dependency is not configured or installed;
- **unknown** — the current surface does not expose enough information.

When the host exposes connection or permission status, inspect it. When a safe read-only call such as list/status/me is available, use it to verify reachability. Do not create, modify, send, delete, publish, or grant access merely to test a connection.

If a harness config contains allow/deny rules, tool scopes, sandbox policies, or approval settings, include them as evidence. Do not infer permissions from file presence alone.

## Diagnose by layer

Work from the lowest-cost evidence upward:

1. skill package/discovery;
2. referenced files and scripts;
3. CLI/interpreter availability;
4. environment-variable names;
5. MCP/tool configuration;
6. connection reachability;
7. authorization/permission scope;
8. instruction/context compatibility;
9. local-versus-cloud runtime differences.

Stop guessing when evidence runs out.

## Output

Return a compact matrix:

| Dependency | Required by | Harness/runtime | Configured | Reachable | Authorized | State | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |

Then summarize:

- blockers that definitely prevent execution;
- unknowns that require a runtime or permission check;
- differences across harnesses;
- the smallest safe remediation for each blocker.

If the user asks to repair portability after diagnosis, use the `agent-portability` workflow and re-run this diagnostic afterward.

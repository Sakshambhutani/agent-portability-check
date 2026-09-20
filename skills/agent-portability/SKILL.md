---
name: agent-portability
description: Diagnose and repair portability of AI agent skills, instructions, MCP dependencies, CLIs, environment requirements, and context across Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, OpenCode, Roo Code, and supported cloud runtimes. Use when a user asks to share, migrate, reuse, compare, or make an agent setup work across harnesses, machines, runtimes, or teammates.
---

# Agent Portability

Make the user's agent setup portable without turning portability into guesswork.

The deterministic checker is the source of truth for discovery and verification. The host harness provides the intelligence for investigating and repairing ambiguous cases.

## Core rule

Use this loop:

1. **Discover** with the checker, including installed plugin-provided skills where the host exposes them locally.
2. **Apply deterministic fixes** with the checker.
3. **Investigate remaining blockers** using the harness's file, shell, search, and reasoning capabilities.
4. **Change only what is supported by evidence.**
5. **Re-run the checker.**
6. **Publish only when the user explicitly asks to share, save, compare with a team, or create a public result.**

Never declare portability based only on your own inspection. Re-run the checker after changes. Keep diagnostic scans private by default.

## Skill freshness

GitHub `main` is the source of truth for every distribution path.

If the user installed this skill with the Skills CLI and asks whether it is current, asks for the latest behavior, or the installed workflow appears stale, tell them to update it with:

```bash
npx skills update agent-portability
```

If the skill came from a Claude or ChatGPT GitHub-managed plugin marketplace, use that host's marketplace refresh/sync mechanism instead of assuming the Skills CLI owns the installation. Repository-backed workspace marketplaces may sync updates automatically, while local plugin copies can require a refresh or reinstall.

Do not interrupt every portability run with an update check. Treat freshness as a lightweight maintenance action, not a prerequisite for using the checker.

## Capability check

First determine whether this environment has access to the user's local filesystem and a shell.

Surface-specific guidance:

- **Claude Cowork / Claude Desktop**: perform project-specific work directly only when the relevant local folder is connected and the environment can run shell commands. A cloud Cowork session may lose local-file access when Claude Desktop is not available, so verify access before project scanning. If a programmatic folder-access request is denied or unsupported once, do not repeatedly retry it; tell the user to use Cowork's **Add folder** picker and continue with any global-only work that is already possible.
- **ChatGPT Work / Codex / ChatGPT Desktop**: perform the workflow directly when the surface exposes the project filesystem and shell. A normal web chat may have the skill installed but still lack access to the user's laptop.
- **Claude or ChatGPT without local execution**: use the skill as the orchestration layer, but ask the user to run the private checker locally and return the JSON/output. Never imply that the local machine was inspected remotely.

If local filesystem/shell access is available, perform the workflow directly.

If it is not available, do not claim to have scanned or fixed the user's machine. Give the user the smallest local command needed and offer to interpret the resulting JSON or terminal output:

```bash
npx github:Sakshambhutani/agent-portability-check --json --no-write --no-publish
```

For a specific target, append one of `--target claude|codex|cursor|gemini|copilot|opencode|roo`. Cloud checks are available for Cursor and GitHub Copilot via `--runtime cloud`.

## Scope

The checker supports two useful modes:

- **Global/user readiness**: home-level skills, instructions, harness configs, and detected tools. Use this when the user asks for "general readiness", "my setup", or similar and no repository is connected.
- **Global + current project**: the same home-level setup plus project-specific skills/instructions/configuration under a selected repository.

For a global-only check, do **not** require or request a project folder first. Run:

```bash
npx github:Sakshambhutani/agent-portability-check \
  --global-only \
  --json --no-write --no-publish
```

State clearly that project scope was skipped and offer a project scan only if the user wants repository-specific readiness.

For a project-aware scan, determine the project root:

```bash
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
```

If the user names another project, use its path instead.

Do not imply that a global-only result is repository-specific.

## Migration mode

Determine whether the user is migrating on the **same machine** or to a **different machine / teammate / cloud environment**.

- **Same machine**: local CLI presence, environment-variable presence, installed plugins, and local MCP configuration are useful evidence.
- **Different machine / teammate / cloud**: local presence is not transferable evidence. Treat installs, secrets, authentication, plugin availability, and machine-specific paths as migration requirements even if they work on the source machine.

If the user did not specify and the distinction materially changes the answer, state the assumption you are using rather than silently treating a same-machine check as cross-machine readiness.

## Readiness evidence

Keep these dimensions separate for every target:

- **Discoverable** — can the target find the skill?
- **Package complete** — is the skill package structurally complete, including references?
- **Dependencies available** — are required CLIs, environment names, and MCP configuration present?
- **Authentication** — not tested unless the host actually verifies credentials/session access.
- **Execution** — not tested unless a representative workflow is actually run in that target.

A symlink or copied `SKILL.md` proves discovery/layout only. It does not prove authentication or successful execution.

Installed plugin skills may rely on files outside the skill directory. Treat those as plugin-root dependencies: they can work in the source plugin while still requiring adaptation before the skill is portable on its own.

## Step 1: Run a private machine-readable diagnostic

General global-only scan (no repo required):

```bash
npx github:Sakshambhutani/agent-portability-check \
  --global-only \
  --json --no-write --no-publish
```

Project-aware scan:

```bash
npx github:Sakshambhutani/agent-portability-check \
  --path "$ROOT" \
  --json \
  --no-write \
  --no-publish
```

Target scan examples:

```bash
npx github:Sakshambhutani/agent-portability-check \
  --path "$ROOT" \
  --target claude \
  --json --no-write --no-publish
```

```bash
npx github:Sakshambhutani/agent-portability-check \
  --path "$ROOT" \
  --target cursor --runtime cloud \
  --json --no-write --no-publish
```

Use the JSON report rather than scraping terminal prose.

If the user says "make it portable everywhere", use the first-class all-harness scan:

```bash
npx github:Sakshambhutani/agent-portability-check \
  --path "$ROOT" \
  --all \
  --json --no-write --no-publish
```

This evaluates Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, OpenCode, Roo Code, Cursor Cloud, and GitHub Copilot Cloud Agent in one report. Use the consolidated matrix instead of orchestrating separate target scans yourself.

## Step 2: Apply deterministic safe fixes

If the user asked to fix, migrate, or "make it portable", treat that as authorization for the checker's safe, non-destructive remediation.

Run the target-aware fix when a target was requested:

```bash
npx github:Sakshambhutani/agent-portability-check \
  --path "$ROOT" \
  --target claude \
  --fix --yes --no-publish
```

For general shared-format cleanup:

```bash
npx github:Sakshambhutani/agent-portability-check \
  --path "$ROOT" \
  --fix --yes --no-publish
```

For "portable everywhere", use one consolidated safe-fix pass:

```bash
npx github:Sakshambhutani/agent-portability-check \
  --path "$ROOT" \
  --all --fix --yes --no-publish
```

The all-harness fix pass only applies deterministic shared-package/discovery changes. It does not guess cloud placement, credentials, context semantics, or ambiguous dependency fixes.

The checker is allowed to create canonical shared copies and safe discovery adapters. It does not silently overwrite existing skill packages.

Re-run the private JSON diagnostic immediately after the fix.

## Step 3: Investigate remaining manual blockers

Read [references/REMEDIATION.md](references/REMEDIATION.md) before changing a manual blocker.

Prioritize user-controlled skills. Harness-managed system skills are not user portability debt and should not be edited merely to improve a score.

For each manual blocker:

1. Read the reported source `SKILL.md`.
2. Inspect only the relevant companion files/configuration first.
3. Look for strong local evidence: renamed files, existing equivalent scripts, another harness's working config, package manifests, or git history.
4. Prefer the smallest reversible change.
5. Preserve the user's source behavior.
6. Re-run the checker after each logical group of changes.

### Good autonomous repairs

You may repair without another question when the evidence makes the intended change unambiguous, for example:

- a referenced file was renamed and the exact replacement exists;
- a stale path differs only by a verified directory move;
- a target harness needs a mechanically equivalent instruction/config file and the source semantics can be preserved exactly;
- an MCP server already has a working non-secret configuration in another harness and the target format translation is deterministic.

### Do not guess

Do not fabricate:

- missing scripts or assets merely to satisfy structural checks;
- secret values, API keys, tokens, credentials, or account IDs;
- a "canonical" version when same-name copies contain materially different intent;
- a package-manager install command when the required dependency is ambiguous;
- behavior that cannot be inferred from existing code/docs/config.

When ambiguity remains, explain the exact decision that remains and the evidence you found. Keep working on other fixable blockers.

For host-specific capabilities that are not ordinary files, CLIs, environment variables, or MCP servers — for example a connected session, a host-native visualization surface, workspace loader, or provider-specific built-in tool — do not pretend the deterministic checker verified an equivalent. Identify the capability, check whether the target has an equivalent when evidence is available, and otherwise mark it as an adaptation/replacement decision.

## Step 4: Handle dependency and context issues intelligently

Use these policies:

- **Environment variables/secrets**: never invent or expose values. A non-secret value may be inferred only from authoritative local configuration or an obvious existing path. Do not persistently modify shell profiles or secret stores without explicit user approval.
- **CLI dependencies**: prefer existing project-local package managers and declared dependencies. Do not use `sudo` or perform global installs without explicit approval.
- **MCP servers**: translate an existing working config when possible. Do not copy credential values into tracked files.
- **Instruction/context gaps**: treat them separately from skill-package readiness. If translating `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Copilot instructions, Cursor rules, OpenCode instructions, or Roo rules, merge conservatively and do not overwrite unrelated target instructions.
- **Cloud runtimes**: local availability does not prove cloud availability. Repository-visible skills, cloud secrets, MCP reachability, and cloud runtime dependencies must be treated explicitly for Cursor Cloud and GitHub Copilot Cloud Agent.
- **Roo mode-specific skills/rules**: preserve their mode intent. Do not flatten a `skills-code` or `rules-architect` workflow into a generic cross-harness instruction without evidence that the specialization is intentional to remove.

Read [references/SCOPE-AND-CLAIMS.md](references/SCOPE-AND-CLAIMS.md) before presenting success.

## Step 5: Verify

Re-run the same private JSON diagnostic used at the start.

A target achievement is valid when all **user-controlled skill packages** for that target are ready with no auto-fix/manual package blockers. Context gaps may still be reported separately.

Do not turn a context warning into the false claim that two harnesses will behave identically.

If the user asked for a specific subset of targets, verify each requested target. If they asked for "everywhere" or "all harnesses", re-run the single `--all` diagnostic and use its consolidated verification state.

If the user explicitly asks to verify **behavior**, and the target harness is actually available with a safe execution path, run a small representative non-destructive workflow after structural verification. Report that execution evidence separately. Do not generalize one successful workflow into a guarantee that every skill behavior is identical.

## Step 6: Optional public result

Do not publish by default when this skill is orchestrating the checker. Keep the verified result private unless the user explicitly asks to share it, save it, compare with teammates, or create a public result.

When requested, publish the coarse result summary by running the checker without `--no-publish`.

Example:

```bash
npx github:Sakshambhutani/agent-portability-check \
  --path "$ROOT" \
  --target claude \
  --no-write
```

For general portability:

```bash
npx github:Sakshambhutani/agent-portability-check \
  --path "$ROOT" \
  --no-write
```

The final result page is the user-facing handoff:

- diagnostic/fix path when readiness is incomplete,
- LinkedIn/X/README sharing after a defensible achievement,
- Team Compare from any diagnostic so teammates can run the same check.

Do not upload skill contents, instruction contents, repository names, or local file paths to make a public result.

## Final response

Keep the final response concise and operational. Include:

- what scope and migration mode were checked;
- target(s), if any;
- **transfers as-is / needs adaptation / needs replacement or user decision**;
- what the deterministic checker fixed;
- what you repaired intelligently;
- remaining dependencies, authentication, or host-specific capability gaps;
- readiness dimensions, explicitly preserving `authentication: not tested` and `execution: not tested` unless evidence exists;
- final result URL only if the user asked for one and one was created.

If something remains manual, say why it requires user intent or external authority rather than calling it an unexplained failure.

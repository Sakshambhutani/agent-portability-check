---
name: agent-release-readiness
description: Run a pre-release gate for an AI agent before it is shared, deployed, migrated, or rolled out. Check portability, dependency health, permissions/connections, reproducibility, eval regressions, version identity, and rollback evidence. Use when a user asks whether an agent version is ready to release or share with a team.
---

# Agent Release Readiness

Gate an agent release on evidence, not on "it worked once."

## Release dimensions

Check these independently:

1. **Identity** — the candidate has an immutable version/revision.
2. **Package/discovery** — skills and instructions are valid and discoverable.
3. **Dependencies** — required CLIs, runtimes, env names, MCPs, and tools are accounted for.
4. **Permissions/connections** — required access is verified or explicitly marked unknown.
5. **Reproducibility** — another environment can identify the exact configuration.
6. **Evaluations** — comparable regression checks exist and new failures are understood.
7. **Portability** — intended harnesses/runtimes were checked.
8. **Rollback** — the prior known-good version is identifiable.
9. **Ownership** — a human/team owner is clear when the release will be shared or operated by others.

## Run portability evidence

For every supported target:

```bash
npx github:Sakshambhutani/agent-portability-check --all --json --no-write --no-publish
```

Or restrict to the release target when appropriate.

Use `agent-diagnostic` for unresolved runtime, permission, or connection questions.

## Require a reproducible candidate

Use `agent-reproducibility` to identify:

- source revision;
- model/config;
- prompt/instruction hashes;
- skill revisions;
- MCP/tool identities;
- dependency versions;
- eval revision.

Do not release a candidate described only as "whatever is on main now" when reproducibility matters.

## Evaluate regressions

Use the project's existing eval system and `agent-eval-regression`.

Treat execution failures separately from quality regressions. If evals changed at the same time as the agent, call out that comparison as confounded.

## Gate states

Use:

- **ready** — required evidence exists and no known blocker remains;
- **ready-with-known-risk** — explicit non-blocking unknown/risk accepted by the user;
- **blocked** — a concrete dependency, permission, portability, or eval blocker exists;
- **not-enough-evidence** — the release may work, but the required evidence has not been collected.

Do not convert unknowns into green checks.

## Final release card

Return:

| Gate | State | Evidence | Blocker / action |
| --- | --- | --- | --- |

Then include:

- immutable candidate ID;
- intended harness/runtime;
- eval baseline/candidate IDs;
- rollback revision;
- unresolved risks;
- exact next action for each blocker.

If the user asks to ship after the gate passes, perform only the deployment/release actions that are actually available and authorized in the current environment.

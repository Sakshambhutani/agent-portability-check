---
name: agent-reproducibility
description: Capture or compare the exact configuration needed to reproduce an AI agent run across machines, teammates, harnesses, and time. Track model identity, instructions, skills and revisions, MCP/tool definitions, dependency versions, environment-variable names, permissions evidence, context sources, harness/runtime, and eval revision without storing secrets. Use when a user asks what exactly ran or wants a reproducible agent version.
---

# Agent Reproducibility

Create evidence for the question: **what exact agent configuration produced this behavior?**

## Reproducibility boundary

Capture identities and revisions, not secrets.

Include when observable:

- model/provider/model parameters;
- harness and runtime;
- prompt/instruction file identities and content hashes;
- skill names, source, path, Git revision, and content hash;
- MCP server/tool identities and non-secret configuration fingerprints;
- CLI/runtime/package versions;
- environment-variable names and whether required values are present;
- permission/connection state with its evidence level;
- retrieval/context source identities and revisions;
- application/orchestration Git commit;
- eval suite and dataset revision.

Never store API keys, tokens, cookies, passwords, connection strings, or secret values.

## Prefer immutable identity

Use, in order of preference:

1. Git commit SHA / immutable artifact digest;
2. package lock/version;
3. content hash;
4. mutable branch/tag only when no immutable revision is available.

A branch name such as `main` is not enough to reproduce a historical run.

## Generate a manifest

When the user asks to persist a reproducibility snapshot, create a machine-readable manifest in a user-approved location. A useful shape is:

```json
{
  "agent": {},
  "model": {},
  "instructions": [],
  "skills": [],
  "tools": [],
  "mcp": [],
  "dependencies": [],
  "environment": [],
  "permissions": [],
  "context": [],
  "runtime": {},
  "eval": {},
  "source_revision": ""
}
```

Store hashes and references rather than copying sensitive content into the manifest.

If the user only asks to inspect, show the manifest without writing it.

## Verify the snapshot

For local skill/package readiness, run:

```bash
npx github:Sakshambhutani/agent-portability-check --all --json --no-write --no-publish
```

Use that result as one source of evidence for skill discovery, dependencies, MCP references, and harness/runtime differences.

## Compare two manifests

When comparing versions or teammates, classify each field as:

- same;
- different;
- missing on one side;
- unknown/unobservable.

Do not collapse "unknown" into "same."

If the user wants to know why behavior changed, pass the manifest diff into the `agent-change-impact` workflow.

## Final result

Return:

- reproducibility status;
- immutable identifiers captured;
- mutable or unknown components;
- secrets intentionally excluded;
- exact blockers preventing another person/runtime from reproducing the setup.

A reproducibility manifest describes configuration identity. It does not guarantee identical model output.

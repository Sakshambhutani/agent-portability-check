---
name: agent-config-drift
description: Detect configuration drift for the same AI agent across teammates, machines, repositories, harnesses, or time. Compare prompts/instructions, model settings, skill versions, MCP/tool configuration, dependencies, permissions/connections, context sources, and runtime. Use when supposedly identical agents behave differently or a team wants to find divergent copies and versions.
---

# Agent Config Drift

Find where "the same agent" stopped being the same configuration.

## Inputs

Prefer two or more reproducibility manifests from `agent-reproducibility`.

If manifests do not exist and the relevant environments are directly accessible, inspect each environment and create temporary in-memory fingerprints. If another teammate or machine is not accessible, ask for its manifest or private diagnostic JSON rather than guessing.

## Compare by identity and content

For each environment compare:

- model/provider and controllable parameters;
- prompt/instruction hashes;
- skill names, source revisions, and hashes;
- MCP/tool identities and non-secret config fingerprints;
- CLI/runtime/package versions;
- environment-variable names/presence;
- permission/connection evidence;
- retrieval/context identities;
- harness and runtime;
- orchestration/application revision.

Distinguish:

- **version drift** — same object name, different revision/content;
- **availability drift** — object exists on one environment but not another;
- **permission drift** — same tool is configured but access differs;
- **runtime drift** — local/cloud or harness behavior differs;
- **context drift** — different instruction/retrieval sources are loaded;
- **unknown drift** — comparison is blocked by missing evidence.

## Establish canonicality carefully

Do not decide that the newest copy is canonical.

Use an explicit source of authority such as:

- repository default/release branch;
- published immutable revision;
- owner-declared canonical source;
- registry record;
- deployment manifest.

If no authority exists, report divergence and ask which version should be canonical before overwriting anything.

## Output

Create a drift matrix:

| Component | Environment A | Environment B | Drift type | Canonical evidence | Action |
| --- | --- | --- | --- | --- | --- |

Prioritize drift that can change behavior:

1. model/prompt/instruction;
2. skill/tool/MCP versions;
3. permission and connection differences;
4. dependencies/runtime;
5. cosmetic or non-behavioral metadata.

If drift is across harnesses, run the portability checker for each relevant target so expected harness differences are not mislabeled as accidental drift.

## Team use

For several teammates, aggregate only fingerprints/versions when privacy matters. Do not require teammates to upload raw prompts, skill contents, secrets, or local paths merely to detect version divergence.

The useful team question is not only "who has the best score?" but "who is actually running the same agent revision?"

---
name: agent-change-impact
description: Trace what changed in an AI agent and relate those changes to evaluation results. Compare model, prompts and instructions, skills, MCP tools, permissions, dependencies, retrieval/context, harness/runtime, and code between a baseline and candidate. Use when a user asks why an eval moved after an agent change, what exactly changed, or which change is associated with a regression or improvement.
---

# Agent Change Impact

Answer two separate questions:

1. **What changed?**
2. **What changed in the evaluations?**

Only connect the two causally when the evidence supports it.

## Establish the baseline and candidate

Prefer explicit versions, Git commits, saved manifests, or existing before/after eval runs.

If the user does not name a baseline, use the nearest defensible source such as:

- the previous Git commit or branch;
- the last released tag;
- a saved reproducibility manifest;
- the previous eval run from the same suite.

State which baseline you used.

## Build a change ledger

Inspect these dimensions independently:

- model/provider/model parameters;
- system, developer, repository, and harness instructions;
- prompts/templates;
- skills and skill content hashes/revisions;
- MCP servers and tool definitions;
- tool permissions, scopes, approvals, and connections when observable;
- CLI/runtime/package dependencies;
- environment-variable **names** and presence, never secret values;
- retrieval sources, context files, and knowledge configuration;
- harness and local/cloud runtime;
- application code that changes orchestration or tool use.

Prefer Git diffs and content hashes over timestamps.

Output a change ledger with:

| Dimension | Baseline | Candidate | Changed? | Evidence |
| --- | --- | --- | --- | --- |

## Compare evaluations

Use the same eval-suite revision, dataset, scorer, and execution conditions when possible.

Report:

- cases added/removed/changed;
- pass/fail deltas;
- score deltas;
- new regressions and newly passing cases;
- latency/tokens/cost only when the eval system actually reports them;
- execution errors separately from quality failures.

Do not compare two eval runs as if they were equivalent when their datasets or scorers changed.

## Attribute carefully

Use these labels:

- **high confidence association** — one material agent dimension changed and the eval setup stayed constant;
- **plausible contributor** — several dimensions changed but the failing cases line up with one change;
- **confounded** — multiple material changes occurred and the available evidence cannot isolate them;
- **unknown** — no comparable baseline/eval evidence exists.

Do not claim causality merely because a change and regression occurred together.

When several dimensions changed and the user wants attribution, propose or run an ablation matrix if it is safe and practical: restore one variable at a time while holding the rest constant.

Ask before running an evaluation likely to incur meaningful external API cost or create external side effects.

## Useful final form

Return:

1. **Change summary** — exactly what changed.
2. **Eval delta** — exactly which cases/metrics moved.
3. **Attribution** — confidence and evidence.
4. **Next discriminating test** — the smallest experiment that would separate competing explanations.

If no pre-change eval exists, say so clearly: you can prove the configuration changed, but you cannot prove the behavioral impact retrospectively.

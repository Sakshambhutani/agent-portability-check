---
name: agent-eval-regression
description: Design, run, and compare regression evaluations for AI agents after changes to prompts, models, skills, tools, MCPs, context, or orchestration. Use when a user wants to know whether an agent change broke behavior, which eval cases regressed, whether an improvement is stable, or what test suite should gate future agent changes.
---

# Agent Eval Regression

Treat agent evaluations like regression tests, while accounting for model variability.

## Discover the existing eval system first

Inspect the repository for existing:

- test/eval scripts;
- package-manager commands;
- datasets and fixtures;
- scorers or judges;
- recorded baselines;
- CI jobs;
- latency/token/cost reporting.

Use the project's existing framework when one exists. Do not invent a second eval stack unnecessarily.

If no eval framework exists, derive a minimal suite from documented product requirements, existing examples, bug reports, or acceptance criteria. Do not invent pass criteria that the user has never defined.

## Freeze the comparison

Record the dimensions that should remain constant:

- eval suite revision;
- dataset/cases;
- scorer/judge;
- harness/runtime;
- tool and MCP availability;
- relevant permissions/connections;
- model parameters when controllable.

Then record the intended change under test.

## Run safely

Prefer deterministic/local tests first.

Before invoking paid model APIs, large test sets, or external systems that may create side effects, estimate the scope and ask for approval when cost or impact could be meaningful.

For stochastic model behavior, avoid treating a single sample as definitive. When the framework supports repeat runs and cost is acceptable, use repeated trials for unstable cases and report variance rather than hiding it.

## Compare results

Separate:

- **quality regression** — behavior/score worsened;
- **execution regression** — tool, MCP, dependency, auth, or environment failure;
- **performance regression** — latency increased;
- **cost regression** — token/API cost increased;
- **coverage change** — cases or scorer changed, making results non-comparable.

Report per-case deltas before aggregate averages.

## Regression triage

For each new failure:

1. confirm the case existed in both runs;
2. confirm the scorer did not change;
3. check execution/dependency errors;
4. connect the failure to the change ledger when available;
5. use `agent-change-impact` when attribution is ambiguous.

Do not silently tune the eval to make the candidate pass.

## Output

Produce:

| Eval case | Baseline | Candidate | Delta | Type | Evidence |
| --- | --- | --- | --- | --- | --- |

Then summarize:

- newly failing cases;
- newly passing cases;
- stable cases;
- non-comparable cases;
- latency/cost changes if measured;
- whether the evidence supports a release gate.

A "no regression" claim requires comparable runs, not merely a green candidate run.

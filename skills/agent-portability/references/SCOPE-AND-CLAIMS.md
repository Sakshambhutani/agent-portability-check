# Scope and claims

## Scope

The checker can inspect global and project-level configuration for supported harnesses.

The current project path affects project-level discovery. It does not restrict the global scan.

## Supported target claims

Use narrow claims such as:

- "3/3 user-controlled skill packages ready for Claude Code"
- "100% portable-ready in shared skill format"
- "Cursor Cloud still needs 2 cloud dependencies configured"

Do not claim:

- identical model behavior across harnesses;
- valid secret values;
- working external services merely because configuration exists;
- cloud availability based only on a local install;
- organization-wide portability from one developer machine.

## Achievement versus context

A target skill-package achievement means package discoverability/structure and checked dependencies are ready for that target.

Harness-specific context gaps such as AGENTS.md versus CLAUDE.md can remain as separate warnings.

This separation is deliberate: skill portability and total behavioral equivalence are different claims.

## Public result privacy

Intermediate intelligent remediation should stay local.

The final public result may contain only coarse summary metrics supported by the checker. Do not include skill names, file paths, repository names, instruction text, credentials, or secret values.

# Remediation policy

Use this reference only after the deterministic checker has classified an item as manual.

## Missing companion file

A missing reference can mean deletion, rename, stale documentation, generated artifact, omitted package content, or an intentionally external dependency.

Investigate in this order:

1. inspect the skill directory tree;
2. search for the basename and likely renamed variants;
3. search references in the repository;
4. inspect git history when available;
5. inspect package/build metadata if the file may be generated.

Repair the reference only when an equivalent existing file is strongly supported by evidence.

Do not create an empty placeholder or invented implementation just to make the checker green.

## Same-name drift

Compare copies semantically, not only textually.

Strong signals for a canonical copy include:

- one copy is a symlink/adapter to a shared source;
- git history clearly shows one copy is newer and intentionally replaces the other;
- one copy is generated from a declared canonical source;
- the user explicitly identifies the canonical version.

If both copies contain distinct useful behavior, do not overwrite either. Explain the conflict and propose consolidation.

## Missing environment variable

Classify the variable as secret or non-secret.

Never infer secret values.

For non-secret path/config variables, infer only from authoritative local state such as an existing config entry or an unambiguous installed path.

Do not modify persistent shell profiles automatically. If persistence is necessary, show the proposed change and obtain explicit approval.

## Missing CLI/interpreter

Check:

1. whether the command exists under another name;
2. project manifests/lockfiles;
3. the skill's own documentation;
4. existing local toolchain managers.

Prefer project-local installation.

Do not use sudo, change system package managers, or install globally without explicit approval.

## MCP server missing on target

Look for a working server definition in another supported harness.

If server name, transport, command/URL, and non-secret arguments translate mechanically, create the target config without copying secrets into tracked files.

If authentication differs or credentials are embedded, stop and surface the required user action.

## Harness-specific instruction gap

Treat instruction translation as semantic work.

Read the source instruction file and the target file if it exists.

Merge only the portable behavioral rules. Preserve target-specific content and avoid duplicating instructions already present.

A remaining context gap does not invalidate a 100% skill-package readiness result; report both separately.

## Harness-managed/system skill

Do not edit harness-managed system skills to improve a user's score.

Report them as excluded/managed unless the user explicitly asks to debug the harness itself.

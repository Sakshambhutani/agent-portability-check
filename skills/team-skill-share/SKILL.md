---
name: team-skill-share
description: Make a Git-backed AI agent skill safely reusable by a teammate. Identify the canonical source, pin the exact revision, check for local-only dependencies or secrets, produce an install path, and verify the recipient's harness after installation. Use when someone says share this skill with my team, let my teammate use the same skill, or make this skill available in another harness.
---

# Team Skill Share

The shared object is the skill, not the portability score.

## V1 boundary

Share **Git-backed skills** first.

Do not upload arbitrary private local skill folders, credentials, secrets, or machine-specific files to make sharing convenient. If a skill exists only locally, help the owner move an appropriate sanitized version into a repository they control before sharing it.

Private repositories are fine when the recipient already has authorized Git access.

## Prepare the skill

Identify:

- skill name;
- repository;
- path inside the repository;
- exact Git commit SHA;
- skill content hash;
- referenced companion files;
- required CLIs/runtime;
- required environment-variable names;
- MCP/tool dependencies;
- known harness compatibility.

Run a private portability diagnostic before sharing:

```bash
npx github:Sakshambhutani/agent-portability-check --all --json --no-write --no-publish
```

Do not claim that a recipient can use the skill merely because the package is structurally valid.

## Pin the revision

Prefer an immutable commit URL rather than `main`.

For a Skills CLI-compatible repository, a pinned direct skill path can be shared in this form:

```bash
npx skills@latest add https://github.com/OWNER/REPO/tree/COMMIT_SHA/path/to/skill
```

If the recipient needs a different installation method, preserve the same commit SHA and skill path.

## Recipient flow

After installation:

1. confirm the installed skill revision/hash;
2. run the portability checker for the recipient's intended harness;
3. diagnose missing CLIs, MCPs, environment-variable names, permissions, or connections;
4. fix only safe deterministic issues;
5. re-run verification.

A successful share means the recipient has the intended revision **and** the target environment can satisfy its runtime requirements.

## Share record

A useful team record contains:

- skill identity;
- canonical repository/path;
- pinned revision;
- shared-by identity if the team system has it;
- dependency summary;
- recipient install status;
- recipient revision match/mismatch;
- harness readiness.

Do not store skill contents or secret values merely for team comparison.

## Drift after sharing

If the recipient modifies the skill or installs another revision, report:

- same revision;
- different revision;
- not installed;
- unknown.

Use `agent-config-drift` for deeper comparison.

This creates the useful growth loop:

```text
useful skill → share → teammate installs → verify → versions diverge → need canonical identity
```

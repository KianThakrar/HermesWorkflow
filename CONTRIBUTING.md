# Contributing

Hermes Manager is local-first financial workflow software. Changes must preserve human review, source traceability, and the boundary that keeps Hermes and Obsidian data on the operator's machine.

The project does not yet include an open-source license. External contributions should wait for backlog item `P0-001`; internal and owner-directed work can continue under the repository owner's terms.

## Choose A Bounded Task

Start from `docs/backlog.md` or open an **Agent task** issue. Every task needs one primary ownership lane, explicit files, dependencies, acceptance criteria, and verification steps. Split work that crosses more than two lanes unless the contract itself is the task.

Use one branch and worktree per contributor or agent. Keep a pull request focused on one backlog item. Do not mix formatting sweeps, generated metadata, or unrelated refactors into feature work.

## Local Setup

```bash
cp .env.example .env
python3 server.py
```

The `.env` file, `data/*.json`, and any local vault are private runtime state. Never commit them.

## Required Checks

Run these before opening a pull request:

```bash
python3 -m unittest discover -s tests -v
python3 -m compileall -q bridge server.py tests scripts
python3 scripts/validate_repo.py
for file in app.js assets/js/*.js assets/js/views/*.js; do node --check "$file"; done
```

Run live connectivity tests only on a configured local machine:

```bash
HERMES_LIVE_TESTS=1 python3 -m unittest tests.test_connectivity -v
```

## Contract Changes

Document changes to API fields, report frontmatter, runtime JSON records, schedule semantics, or Obsidian paths in the pull request. Update producers, consumers, fixtures, and tests together. Prefer backward-compatible readers when existing local state may survive an upgrade.

## Privacy And Safety

- Use synthetic fixtures in tests, screenshots, and issues.
- Never commit client emails, report output, vault notes, local paths, tokens, credentials, or process logs.
- Keep the bridge bound to loopback and preserve origin and token checks.
- Treat model output as untrusted text and escape it before HTML rendering.
- Require explicit human review before destructive commands, external delivery, or financial decisions.
- Do not weaken path-containment or report-idempotency checks.

## Pull Request Handoff

A reviewable handoff states what changed, what did not change, the contract affected, tests run, known limitations, and the next dependent backlog item. A passing CI run does not replace browser checks for user-facing changes.

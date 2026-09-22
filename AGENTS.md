# Agent Coordination

This file defines how coding agents collaborate in this repository. Read `CONTRIBUTING.md`, `docs/ownership.md`, and the assigned issue before changing code.

## Working Rules

1. Work from one issue or backlog ID and declare one primary ownership lane.
2. Use a dedicated branch and worktree. Never share a writable worktree between concurrent agents.
3. Claim expected files in the issue before editing. If another active task owns the same file, coordinate the contract or wait.
4. Preserve existing public API and storage shapes unless the issue explicitly changes that contract.
5. Keep commits scoped and leave unrelated user or agent changes intact.
6. Add tests in the same change as behavior. Use synthetic vaults and mocked Hermes commands by default.
7. Record a concise handoff with changed files, tests, assumptions, and dependent work.

## Parallel Lanes

- **Frontend experience** owns `index.html`, `styles.css`, and `assets/js/views/`.
- **Browser and API transport** owns `assets/js/api.js`, `assets/js/connection.js`, and HTTP routing/security in `bridge/http_server.py`.
- **Hermes runtime** owns `bridge/hermes.py`, `bridge/runs.py`, `bridge/jobs.py`, and `bridge/scheduler.py`.
- **Obsidian and reporting** owns `bridge/obsidian.py`, `bridge/reports.py`, and vault-writing helpers in `bridge/storage.py`.
- **Quality, deployment, and documentation** owns tests, fixtures, `.github/`, deployment configuration, and docs.

Shared contract files such as `bridge/config.py`, `bridge/state.py`, `assets/js/state.js`, and `assets/js/config.js` require the impacted lane owners to agree on the data shape before implementation.

## Forbidden Inputs

Do not read, edit, or commit `.env`, `data/*.json`, a user's vault, Hermes state directories, or real client material for routine development. Live checks are opt-in and must not alter the real inbox or create external delivery.

## Definition Of Done

The issue acceptance criteria pass, isolated tests pass, repository validation passes, changed JavaScript and Python compile, user-facing behavior is checked at desktop and mobile widths, and the handoff names any remaining risk.

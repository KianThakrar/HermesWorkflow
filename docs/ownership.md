# Module Ownership

Ownership is functional rather than personal. `CODEOWNERS` currently routes final review to the maintainer; this document lets parallel contributors divide implementation without blurring contracts.

| Lane | Owns | Public contract | Required verification |
| --- | --- | --- | --- |
| Frontend experience | `index.html`, `styles.css`, `assets/js/views/`, `assets/js/utils.js` | Accessible DOM, responsive layouts, escaped rendering, callback signatures | JavaScript syntax, desktop/mobile browser checks, no console errors |
| Browser and API transport | `assets/js/api.js`, `assets/js/connection.js`, `bridge/http_server.py` | HTTP methods, status codes, CORS, pairing token, browser connection settings | API lifecycle, origin/token tests, private-network preflight |
| Hermes runtime | `bridge/hermes.py`, `bridge/runs.py`, `bridge/jobs.py`, `bridge/scheduler.py` | Run and recurring-job records, status mappings, CLI invocation | Mocked CLI tests, scheduler idempotency, opt-in live smoke test |
| Obsidian and reporting | `bridge/obsidian.py`, `bridge/reports.py`, relevant `bridge/storage.py` helpers | Vault-relative paths, report frontmatter, source IDs, idempotency | Temporary-vault tests, path containment, duplicate-save checks |
| Quality, deployment, and documentation | `tests/`, `scripts/`, `.github/`, `vercel.json`, `.vercelignore`, docs | CI gates, fixtures, contributor workflow, deployment boundary | Full isolated suite, repository validation, configuration review |

## Shared Contracts

- `bridge/config.py`: environment and local-path resolution.
- `bridge/state.py`: complete browser-facing state shape and privacy redaction.
- `assets/js/state.js`: browser state defaults and local preferences.
- `assets/js/config.js`: workflow names, states, and visual status semantics.

A task changing a shared contract must name every producer and consumer in its issue. Land the contract and compatibility tests before independent UI and runtime changes that depend on it.

## Merge Order

1. Contract and fixture changes.
2. Backend producer or persistence changes.
3. Frontend consumer changes.
4. End-to-end and browser coverage.
5. Documentation and deployment notes.

Independent changes within separate lanes may merge in any order when they do not alter a shared contract.

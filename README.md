# Hermes Manager

Hermes Manager is a local-first operating workspace for Hermes, email briefings, a three-stage Kanban board, and an Obsidian vault. It uses a split architecture so the interface can be hosted while private data remains on the operator's laptop.

## Architecture

- **Hosted interface**: static HTML, CSS, and JavaScript suitable for Vercel.
- **Local bridge**: a loopback-only Python service that talks to the local Hermes CLI and Obsidian vault.
- **Private state**: prompts, run output, report indexes, and vault files remain local and are excluded from Git.
- **Connection boundary**: hosted origins must be explicitly allowed, and an optional pairing token can protect every API request.

Vercel never runs Hermes and never receives the Obsidian vault. The browser connects from the hosted interface to `127.0.0.1` on the same laptop.

## Run The Local Bridge

Set the local paths and start the service:

```bash
export HERMES_CLI_PATH="$(command -v hermes)"
export HERMES_VAULT_PATH="/absolute/path/to/your/ObsidianVault"
export HERMES_MANAGER_ALLOWED_ORIGINS="https://your-project.vercel.app"
export HERMES_MANAGER_TOKEN="replace-with-a-long-random-token"
python3 server.py
```

For local-only use, open `http://127.0.0.1:4174`. For the hosted interface, open **Setup**, enter `http://127.0.0.1:4174` and the same pairing token, then test and save the connection. Chrome or Edge is recommended for the hosted-to-loopback connection; Safari may block HTTPS pages from calling an HTTP loopback service.

The bridge binds only to `127.0.0.1`. Do not change it to `0.0.0.0` unless you also add network-level access controls and HTTPS.

## Deploy The Interface

1. Import this GitHub repository into Vercel.
2. Leave the framework preset as **Other** and the project root as `./`.
3. No build command or environment variables are required for the static interface.
4. Deploy, then add the resulting exact origin to `HERMES_MANAGER_ALLOWED_ORIGINS` when starting the local bridge.

Preview deployment URLs change. For predictable pairing, assign a production domain or add each preview origin explicitly. Comma-separated origins and shell-style patterns are supported.

## Product Surface

The top-level tabs are intentionally small:

- **Kanban**: Pending, In Progress, and Completed work, with dates, company labels, quiet source links, and Obsidian tracebacks.
- **Agent Management**: the local **How may I?** console, currently running processes by default, human-readable recurring schedules, prompt comparison, direct Obsidian evidence, and an operator traceback.
- **Information Overview**: a compact summary of live work, desk items, and trace records. Historical sessions are not presented as active work.
- **Reports**: a durable archive of Hermes briefings with rendered/source Markdown, source-note links, Obsidian opening, and Markdown download.
- **Setup**: per-browser bridge URL, pairing token, connection diagnostics, and active model/provider details.

Tasks and cards are local-first. Status changes and new tasks are persisted by the bridge, while agent-management operations are staged for review rather than executed destructively against Hermes.

Console prompts are sent to a local Hermes one-shot process with the configured vault supplied as context. Run history is kept in `data/runs.json`; recurring prompt configuration is kept in `data/recurring-jobs.json`; report indexes are kept in `data/reports.json`; and saved prompts are kept in `data/prompt-presets.json`. These files are intentionally ignored by Git. Durable report Markdown is written to the connected vault's `Briefings/` directory. Browser-only preferences and the bridge connection are stored in local browser storage.

Run `python3 -m unittest discover -s tests -v` for the isolated test suite. Live Hermes checks require `HERMES_LIVE_TESTS=1` and a configured local CLI and vault.

## Structure

The frontend is split into `assets/js/config.js`, `api.js`, `state.js`, `modal.js`, and view modules under `assets/js/views/`. The Python bridge is organized into small modules under `bridge/` for configuration, storage, Hermes access, Obsidian access, state assembly, and HTTP handling.

See [docs/hermes-bridge.md](./docs/hermes-bridge.md) for the integration contract and contributor notes.

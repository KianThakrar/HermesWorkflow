# Hermes Bridge

Hermes Manager is a static browser frontend backed by a small local Python bridge. The bridge is the boundary between a local or Vercel-hosted UI, the local Hermes CLI, and the Obsidian vault.

```text
Hermes CLI <-> local bridge <-> Hermes Manager UI
Obsidian vault <-> local bridge
```

## Source Of Truth

Obsidian is the durable source and tracing layer. Inbox notes provide the email summary, company context, labels, and source path shown on cards. The bridge may keep small JSON files for dashboard-specific state such as manual tasks, status overrides, and staged actions; these are operational projections, not a replacement for the vault.

Use client-facing labels rather than exposing raw vault folder names:

```text
Relationship: Founder, Advisor, LP, Banker, Lawyer, Management, Portfolio, Internal
Deal Stage: Sourcing, Screening, NDA, Diligence, IC Prep, LOI, Closing, Portfolio
Workstream: Financials, Legal, Commercial, Operations, Technology, Data Room, Financing
Action Type: Reply, Review, Schedule, Request Info, Draft Memo, Escalate
Owner: Partner, Principal, VP, Associate, IR, Operations, Hermes, Unassigned
Priority: Critical, High, Medium, Low
```

Every rendered card should retain enough provenance to find its originating Obsidian note. For a financial workflow, summaries remain reviewable by a human; UI labels and confidence signals must not be treated as investment advice or an approval decision.

## API Boundary

The local server exposes a deliberately small contract:

```text
GET   /api/health
GET   /api/state
POST  /api/sync
POST  /api/tasks
POST  /api/actions
POST  /api/runs
POST  /api/recurring
POST  /api/recurring/:id/run
POST  /api/runs/:id/save
PATCH /api/cards/:id
GET   /api/reports
GET   /api/reports/:id
GET   /api/reports/:id/download
```

Reads should gather the configured vault inbox plus safe Hermes CLI observations such as status, Kanban items, recurring jobs, sessions, and recent errors. Writes should update local dashboard state and, where configured, create traceable Obsidian records.

The bridge binds to `127.0.0.1` and rejects browser origins other than loopback origins and patterns listed in `HERMES_MANAGER_ALLOWED_ORIGINS`. When `HERMES_MANAGER_TOKEN` is set, every API request must provide the matching `X-Hermes-Token` header. CORS preflights include the private-network opt-in required by browsers that enforce local network access checks. Do not accept a vault path from an API request; the bridge owner configures it locally.

The Agent Management view defaults to the live process set. Hermes session history and log warnings are retained as traceback data and are never relabeled as queued or running agents. A connected gateway is a service-health signal, not an active agent run; the live run count comes from Hermes `Active:` status.

Agent-management requests are staged as actions with an audit-friendly payload and status. Do not invoke destructive Hermes commands from a browser click without an explicit review and confirmation flow.

`POST /api/runs` starts a local, one-shot Hermes chat with the request passed over stdin and returns the updated run list. Runs are collected in the background and move through `queued`, `running`, `completed`, or `failed`. `POST /api/recurring` saves a prompt configuration locally and mirrors it as a paused Hermes cron record; the local bridge scheduler owns execution so each scheduled run can be captured and written to Obsidian exactly once. The UI turns daily, weekday, weekly, every-other-week, monthly, and every-other-day controls into Hermes schedules while retaining the human-readable settings beside the cron expression. Email delivery is intentionally represented as an in-app, email-ready preview until a mail provider is connected.

Completed report runs are indexed in `data/reports.json` and written as Markdown below the configured vault's `Briefings/` directory. Manual console runs remain unsaved until the operator chooses **Save to Obsidian**. Report reads and downloads reject records whose paths leave the active vault's `Briefings/` directory.

`GET /api/health` runs independent checks for the HTTP bridge, Hermes CLI, gateway, and configured Obsidian vault, and returns the active model/provider strings for local diagnostics. The checks are also covered by `tests/test_connectivity.py`.

## Contributor Structure

Keep integration logic out of the view layer:

- `assets/js/views/` renders Kanban, Agent Management, and Information Overview.
- `assets/js/api.js` owns browser-to-bridge requests.
- `assets/js/connection.js` owns the locally stored bridge URL and optional pairing token.
- `assets/js/state.js` owns client state and refresh behavior.
- `bridge/config.py` defines local paths and settings.
- `bridge/storage.py` owns JSON persistence and note writing.
- Additional bridge modules should isolate Hermes CLI parsing, Obsidian parsing, state assembly, and HTTP routing.

Prefer small, inspectable functions and deterministic status mappings. Keep the app dependency-free where practical so contributors can run it with Python and a browser.

## Local Run

```bash
cp .env.example .env
# Edit .env with the local Hermes CLI, vault, hosted origin, and token.
python3 server.py
```

Then open `http://127.0.0.1:4174`, or deploy the static frontend to Vercel and pair it from the Setup workspace. Machine paths, tokens, vault files, and `data/*.json` are ignored by Git. Obsidian URLs use the vault name and vault-relative note path rather than a filesystem path.

# Prioritized Backlog

Each item is sized for one focused pull request unless noted. Create it with the **Agent task** issue form, retain the ID in the title, and assign exactly one primary lane.

Recommended labels are `priority:p0`, `priority:p1`, `priority:p2`, `lane:frontend`, `lane:transport`, `lane:runtime`, `lane:obsidian`, `lane:quality`, `type:bug`, and `type:feature`. Create labels before applying them to imported issues.

## P0: Release And Trust Boundary

### P0-001: Select An Open-Source License

- **Lane:** Quality, deployment, and documentation
- **Owner decision:** Select the license before accepting external contributions.
- **Acceptance:** A root `LICENSE` exists; README and contribution terms agree; no dependency or client-data terms conflict.

### P0-002: Hosted Pairing End-To-End Test

- **Lane:** Browser and API transport
- **Depends on:** None
- **Scope:** Exercise static-origin to loopback bridge setup, allowed and denied origins, pairing token success/failure, and reconnect behavior.
- **Acceptance:** Automated API coverage uses an ephemeral bridge; browser coverage verifies Setup feedback; logs and failures contain no absolute paths or secrets.

### P0-003: Safe Agent Lifecycle Controls

- **Lane:** Hermes runtime
- **Depends on:** P0-002
- **Scope:** Define create, inspect, retry, cancel, and archive semantics for one-off agents without exposing destructive raw CLI commands.
- **Acceptance:** Every operation has a stable record and terminal state; cancel/retry are idempotent; unsupported actions fail clearly; UI actions require deliberate confirmation where destructive.

### P0-004: Scheduler Reliability And Time Zones

- **Lane:** Hermes runtime
- **Depends on:** None
- **Scope:** Replace implicit local-time assumptions with an explicit configured time zone and durable next-run calculation.
- **Acceptance:** Daily, weekdays, weekly, biweekly, monthly, and every-other-day schedules have deterministic tests across restart and daylight-saving boundaries; one report is produced per scheduled period.

### P0-005: Repeatable Boss Demo Scenario

- **Lane:** Quality, deployment, and documentation
- **Depends on:** P0-002, P0-003
- **Scope:** Seed an isolated synthetic vault, run one briefing, save it, reopen it, and advance one Kanban item.
- **Acceptance:** One documented command prepares the demo without touching the real vault; expected screen sequence and reset steps are documented; all synthetic identities are clearly fictional.

## P1: Core Product Quality

### P1-001: Incremental Vault Index

- **Lane:** Obsidian and reporting
- **Depends on:** P0-004
- **Scope:** Track note identity, modification time, thread, sender, date, and source relationships without rescanning unchanged Markdown.
- **Acceptance:** Added, changed, moved, and deleted notes reconcile deterministically; indexes remain vault-relative; malformed notes are isolated rather than breaking sync.

### P1-002: Context Selection And Provenance

- **Lane:** Obsidian and reporting
- **Depends on:** P1-001
- **Scope:** Select bounded recent and thread-relevant evidence for Hermes instead of asking it to inspect the whole vault every run.
- **Acceptance:** Context policy is configurable by date window and source count; source IDs survive into reports; missing evidence is stated explicitly; token estimates are observable.

### P1-003: Audit And Undo For Kanban Changes

- **Lane:** Browser and API transport
- **Depends on:** None
- **Scope:** Record before/after status and due-date changes, then support a safe undo operation.
- **Acceptance:** Audit entries are immutable and timestamped; undo is itself audited; stale undo requests fail without overwriting newer changes; corresponding Obsidian traceback is created.

### P1-004: Report History And Comparison

- **Lane:** Frontend experience
- **Depends on:** P1-002
- **Scope:** Compare two report runs for the same recurring job while keeping the default Reports view focused.
- **Acceptance:** Users can select dates, see added/removed actions and changed deadlines, open source notes, and return to the normal report view without a modal.

### P1-005: Accessibility And Keyboard Workflow

- **Lane:** Frontend experience
- **Depends on:** None
- **Scope:** Complete keyboard navigation, focus states, semantic status announcements, and contrast review across dark and light modes.
- **Acceptance:** Core Kanban, Setup, Agent Management, and Reports workflows are keyboard-complete; focus never becomes trapped; automated checks and manual notes are included.

## P2: Integrations And Scale

### P2-001: Pluggable Delivery Adapters

- **Lane:** Hermes runtime
- **Depends on:** P0-003, P1-002
- **Scope:** Define an adapter interface for in-app, email, and future Slack delivery without placing provider credentials in browser code.
- **Acceptance:** In-app remains the default; adapters receive a redacted report envelope; retries and delivery receipts are auditable; external sending always requires explicit configuration.

### P2-002: Company And Contact Directory

- **Lane:** Obsidian and reporting
- **Depends on:** P1-001
- **Scope:** Normalize companies, people, domains, and relationship roles from vault evidence.
- **Acceptance:** Records retain source links and aliases; merging is reversible; the UI never treats inferred identity as verified without human confirmation.

### P2-003: Multi-User Deployment Design

- **Lane:** Quality, deployment, and documentation
- **Depends on:** P0-002 through P1-003
- **Scope:** Produce a threat model and architecture decision record before adding accounts or a shared database.
- **Acceptance:** Data residency, authentication, authorization, encryption, audit, tenant isolation, and local-vault access are explicitly resolved; no implementation begins from this issue alone.

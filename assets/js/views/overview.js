import { escapeHtml, formatCalendarDate } from "../utils.js";

export function renderOverview({ root, overview, cards, vault, agents, actions, traceback }) {
  const recentCards = cards.slice(0, 6);
  const recentNotes = (vault?.notes || []).slice(0, 5);
  const activeAgents = agents.filter((agent) => agent.status === "Running");
  const traceRecords = [
    ...actions,
    ...(traceback || []).map((item) => ({ title: "Hermes log", detail: item.raw || item.name, status: "observed" })),
  ];

  root.innerHTML = `
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Overview</p>
        <h2>Information Overview</h2>
      </div>
      <span class="status-pill">${activeAgents.length} active agents</span>
    </div>
    <section class="overview-grid">
      <article class="panel-card">
        <header class="panel-card-header"><h2>Agent Activity</h2></header>
        <div class="panel-card-body">
          ${activeAgents.slice(0, 8).map(renderOverviewItem).join("") || '<div class="empty-lane">No agent processes currently running.</div>'}
        </div>
      </article>
      <article class="panel-card overview-email-card">
        <header class="panel-card-header"><div><p class="section-kicker">Obsidian Inbox</p><h2>Email Summaries</h2></div><span class="status-pill">${recentNotes.length} recent</span></header>
        <div class="panel-card-body">
          ${recentNotes.map(renderEmailSummary).join("") || '<div class="empty-lane">No email summaries found.</div>'}
        </div>
      </article>
      <article class="panel-card">
        <header class="panel-card-header"><h2>Desk Items</h2></header>
        <div class="panel-card-body">
          ${recentCards.map(renderCardLine).join("")}
        </div>
      </article>
      <article class="panel-card">
        <header class="panel-card-header"><h2>Traceback</h2></header>
        <div class="panel-card-body">
          ${traceRecords.slice(0, 8).map(renderTraceLine).join("") || '<div class="empty-lane">No trace records yet.</div>'}
        </div>
      </article>
    </section>
  `;
}

function renderOverviewItem(item) {
  return `
    <article class="build-card">
      <div class="build-title">${escapeHtml(item.name || item.title || "Agent event")}</div>
      <p class="muted-line">${escapeHtml(item.currentTask || item.detail || item.role || "No detail")}</p>
    </article>
  `;
}

function renderCardLine(card) {
  return `
    <article class="task-card" style="--priority-color: var(--blue)">
      <div class="task-row">
        <div>
          <div class="task-title">${escapeHtml(card.title || card.company)}</div>
          <p class="muted-line">${escapeHtml(card.summary)}</p>
        </div>
        <span class="status-pill">${formatCalendarDate(card.dueDate)}</span>
      </div>
    </article>
  `;
}

function renderEmailSummary(note) {
  const body = String(note.body || "").replace(/\s+/g, " ").slice(0, 230);
  return `<article class="overview-email-item"><div class="overview-email-heading"><strong>${escapeHtml(note.title)}</strong><time>${escapeHtml(formatTimestamp(note.date))}</time></div><p class="muted-line">${escapeHtml(body)}${body.length === 230 ? "..." : ""}</p>${note.obsidianHref ? `<a class="quiet-link" href="${escapeHtml(note.obsidianHref)}">Open Obsidian note</a>` : ""}</article>`;
}

function formatTimestamp(value) {
  if (!value) return "Recent";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value).slice(0, 16) : date.toLocaleDateString([], { day: "2-digit", month: "short" });
}

function renderTraceLine(action) {
  return `
    <article class="feedback-card">
      <div class="feedback-title">${escapeHtml(action.title || action.kind)}</div>
      <p class="muted-line">${escapeHtml(action.detail || action.createdAt || "Trace record")}</p>
    </article>
  `;
}

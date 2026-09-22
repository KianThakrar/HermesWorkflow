import { escapeHtml } from "../utils.js";

/**
 * Render durable Obsidian reports and completed runs that still need an
 * explicit save. Persistence is owned by bridge callbacks supplied by app.js.
 */
export function renderReports({ root, reports = [], runs = [], vault = {}, selectedReport, onLoadReport, onSaveRunReport, onRunFollowUp }) {
  const unsavedRuns = runs
    .filter((run) => run.status === "completed" && !run.reportId && run.kind !== "report-follow-up" && run.output)
    .map((run) => ({
      id: `run:${run.id}`,
      runId: run.id,
      title: run.title || "Completed Hermes run",
      createdAt: run.completedAt || run.startedAt,
      updatedAt: run.completedAt || run.startedAt,
      content: run.output,
      status: "unsaved",
    }));
  const entries = [...reports.map((report) => ({ ...report, saved: true })), ...unsavedRuns];
  const selected = selectedReport || entries[0] || null;
  const selectedContent = selected?.markdown || selected?.content || "";
  const selectedBody = selected?.body || selectedContent;
  const isLoading = Boolean(selected?.saved && !selected?.markdown);

  root.innerHTML = `
    <div class="panel-heading reports-heading">
      <div><p class="section-kicker">Obsidian archive</p><h2>Reports</h2></div>
      <span class="status-pill">${entries.length} ${entries.length === 1 ? "report" : "reports"}</span>
    </div>
    <div class="reports-workspace is-focus" data-reports-workspace>
      <aside class="reports-list" aria-label="Saved reports">
        ${entries.length ? entries.map((report) => renderReportListItem(report, selected?.id)).join("") : '<div class="empty-lane">No reports have been generated yet.</div>'}
        ${unsavedRuns.length ? '<p class="reports-list-note">Completed runs stay here until saved to Obsidian.</p>' : ""}
      </aside>
      <article class="report-editor" aria-live="polite">
        ${selected ? renderEditor(selected, selectedBody, isLoading, vault, runs) : renderEmptyEditor()}
      </article>
    </div>
  `;

  root.querySelectorAll("[data-report-id]").forEach((button) => button.addEventListener("click", () => {
    const reportId = button.dataset.reportId;
    const next = entries.find((report) => report.id === reportId);
    if (!next) return;
    if (next.saved && !next.markdown) onLoadReport?.(next.id);
    else renderReports({ root, reports, runs, vault, selectedReport: next, onLoadReport, onSaveRunReport, onRunFollowUp });
  }));

  if (selected?.saved && !selected.markdown) {
    onLoadReport?.(selected.id);
    return;
  }
  bindEditor(root, selected, selectedBody, onSaveRunReport, onRunFollowUp);
}

function renderEditor(report, content, isLoading, vault, runs) {
  const canSave = report.status === "unsaved" && report.runId;
  const sourceIds = report.sourceIds || report.metadata?.sourceIds || [];
  const sourceLinks = sourceIds
    .map((id) => (vault.notes || []).find((note) => note.id === id))
    .filter(Boolean)
    .map((note) => note.obsidianHref
      ? `<a class="report-source-link" href="${escapeHtml(note.obsidianHref)}">${escapeHtml(note.id)} · ${escapeHtml(note.title)}</a>`
      : `<span class="report-source-link">${escapeHtml(note.id)} · ${escapeHtml(note.title)}</span>`)
    .join("");
  const openHref = report.obsidianHref || "";
  return `
    <header class="report-editor-header">
      <div>
        <p class="section-kicker">${escapeHtml(formatTimestamp(report.createdAt))}</p>
        <h3 class="report-title">${escapeHtml(report.title || "Hermes report")}</h3>
        <p class="muted-line">${escapeHtml(report.model || report.metadata?.model || "Configured model")} · ${escapeHtml(report.provider || report.metadata?.provider || "Local Hermes")}</p>
      </div>
      <div class="report-actions">
        <button class="small-button" type="button" data-report-list-toggle>Browse reports</button>
        <button class="small-button" type="button" data-report-mode="rendered">Rendered</button>
        <button class="small-button" type="button" data-report-mode="source">Source</button>
        ${canSave ? '<button class="small-button primary" type="button" data-report-save>Save to Obsidian</button>' : '<span class="report-saved-state">Saved to Obsidian</span>'}
        ${openHref ? `<a class="small-button" href="${escapeHtml(openHref)}" target="_blank" rel="noreferrer">Open in Obsidian</a>` : ""}
        <button class="small-button" type="button" data-report-download>Download Markdown</button>
      </div>
    </header>
    <form class="report-followup" data-report-followup>
      <div class="report-followup-heading"><span class="section-kicker">Follow-up</span><strong>Ask about this briefing</strong></div>
      <div class="report-followup-controls"><input name="question" type="text" placeholder="Clarify a point, highlight supporting evidence, or ask what needs attention next..." aria-label="Ask about this briefing" required /><button class="small-button primary" type="submit">Ask Hermes</button></div>
    </form>
    <div class="report-document ${isLoading ? "is-loading" : ""}">
      ${isLoading ? '<p class="muted-line">Loading report from Obsidian...</p>' : `<div class="report-markdown-rendered markdown-preview" data-report-rendered>${renderMarkdown(content)}</div><pre class="report-markdown-source" data-report-source>${escapeHtml(content)}</pre>`}
    </div>
    ${renderFollowUps(report, runs)}
    <details class="report-sources"><summary class="report-sources-toggle">Source references <span>${sourceIds.length}</span></summary><div class="report-source-links">${sourceLinks || '<span class="muted-line">Source references will appear here when Hermes includes email IDs.</span>'}</div></details>
    <p class="report-state" data-report-state>${canSave ? "Completed run ready to archive." : "Stored in the connected Obsidian vault."}</p>
  `;
}

function renderFollowUps(report, runs = []) {
  const followUps = runs
    .filter((run) => run.kind === "report-follow-up" && run.metadata?.reportId === report.id)
    .sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0))
    .slice(0, 3);
  if (!followUps.length) return "";
  return `<section class="report-followup-results" aria-label="Briefing follow-up answers">${followUps.map((run) => `<article class="report-followup-result"><div><span class="section-kicker">${escapeHtml(run.status === "completed" ? "Answer" : run.status)}</span><time>${escapeHtml(formatTimestamp(run.startedAt))}</time></div><p>${escapeHtml(run.output || run.error || "Hermes is working on this answer...")}</p></article>`).join("")}</section>`;
}

function renderEmptyEditor() {
  return '<div class="report-empty-state"><p class="section-kicker">No output yet</p><h3>Reports will appear here</h3><p class="muted-line">Run a saved prompt from Agent Management, then archive the result to the connected Obsidian vault.</p></div>';
}

function bindEditor(root, report, content, onSaveRunReport, onRunFollowUp) {
  const workspace = root.querySelector("[data-reports-workspace]");
  const rendered = root.querySelector("[data-report-rendered]");
  const source = root.querySelector("[data-report-source]");
  const focusButton = root.querySelector("[data-report-list-toggle]");
  const syncFocusControls = () => {
    const focused = workspace?.classList.contains("is-focus");
    if (focusButton) focusButton.textContent = focused ? "Browse reports" : "Focus report";
  };
  focusButton?.addEventListener("click", () => {
    workspace?.classList.toggle("is-focus");
    syncFocusControls();
  });
  root.querySelectorAll("[data-report-mode]").forEach((button) => button.addEventListener("click", () => {
    const sourceMode = button.dataset.reportMode === "source";
    rendered?.classList.toggle("is-hidden", sourceMode);
    source?.classList.toggle("is-visible", sourceMode);
  }));
  root.querySelector("[data-report-save]")?.addEventListener("click", () => onSaveRunReport?.(report.runId, report.title));
  root.querySelector("[data-report-download]")?.addEventListener("click", () => downloadMarkdown(`${slugify(report.title || "hermes-report")}.md`, content));
  root.querySelector("[data-report-followup]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = new FormData(event.currentTarget).get("question")?.toString().trim();
    onRunFollowUp?.({ question, report });
  });
  syncFocusControls();
}

function renderReportListItem(report, selectedId) {
  const state = report.status === "unsaved" ? "Needs save" : "Saved";
  return `<button class="report-list-item ${report.id === selectedId ? "is-active" : ""}" type="button" data-report-id="${escapeHtml(report.id)}"><span><strong>${escapeHtml(report.title || "Hermes report")}</strong><small>${escapeHtml(state)}</small></span><time>${escapeHtml(formatTimestamp(report.updatedAt || report.createdAt))}</time></button>`;
}

function renderMarkdown(markdown) {
  return String(markdown || "")
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((line) => /^- /.test(line))) return `<ul>${lines.map((line) => `<li>${renderInline(line.slice(2))}</li>`).join("")}</ul>`;
      if (/^### /.test(lines[0])) return `<h4>${renderInline(lines[0].slice(4))}</h4>`;
      if (/^## /.test(lines[0])) return `<h3>${renderInline(lines[0].slice(3))}</h3>`;
      if (/^# /.test(lines[0])) return `<h2>${renderInline(lines[0].slice(2))}</h2>`;
      return `<p>${lines.map(renderInline).join("<br>")}</p>`;
    })
    .join("");
}

function renderInline(value) {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
      const safeUrl = /^(https?:|obsidian:|file:)/i.test(url) ? url : "#";
      return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">${label}</a>`;
    });
}

function downloadMarkdown(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatTimestamp(value) {
  if (!value) return "Undated";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Undated" : date.toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "hermes-report";
}

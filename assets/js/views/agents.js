import { escapeHtml, renderMarkdownPreview } from "../utils.js";

const DEFAULT_EMAIL_PROMPT = "Review the most recent email-summary notes in the connected Obsidian vault. Return a short daily briefing with bullet points grouped into urgent actions, deal activity, portfolio or liquidity items, LP or relationship follow-ups, and items requiring no response. Include the source note ID for every item. Do not make investment decisions or present unverified claims as facts.";

const CADENCES = [
  ["daily", "Daily"],
  ["weekdays", "Weekdays"],
  ["weekly", "Weekly"],
  ["biweekly", "Every other week"],
  ["monthly", "Monthly"],
  ["every-other-day", "Every other day"],
];

const WEEKDAYS = [["1", "Monday"], ["2", "Tuesday"], ["3", "Wednesday"], ["4", "Thursday"], ["5", "Friday"], ["6", "Saturday"], ["0", "Sunday"]];

export function renderAgentManagement({ root, agents, vault, actions, recurringJobs, sort, filter, selectedVaultId, onSort, onFilter, onStageAction, onSelectVault, onSaveRecurring, onRunRecurring, onComparePrompts, onOpenReport, onCreateAgent, bridge, runs }) {
  const notes = vault.notes || [];
  const selected = notes.find((note) => note.id === selectedVaultId) ?? notes[0];
  const jobs = recurringJobs?.length ? recurringJobs : [defaultRecurringJob()];
  const visibleAgents = sortAgents(filterAgents(agents, filter), sort);

  root.innerHTML = `
    <div class="panel-heading">
      <div><p class="section-kicker">Execution</p><h2>Agent Management</h2></div>
      <div class="control-actions">
        <select data-agent-filter aria-label="Filter agent rows">${["running", "all", "recurring", "system"].map((value) => `<option value="${value}" ${value === filter ? "selected" : ""}>${labelForFilter(value)}</option>`).join("")}</select>
        <select data-agent-sort aria-label="Sort agent rows">${["status", "queue", "runtime", "name"].map((value) => `<option value="${value}" ${value === sort ? "selected" : ""}>Sort: ${value}</option>`).join("")}</select>
        <button class="button primary" type="button" data-toggle-agent-creator>New Agent</button>
      </div>
    </div>

    ${renderAgentCreator()}

    <section class="live-process-strip" aria-label="Live Hermes processes">
      <div><span class="section-kicker">Live Processes</span><strong>${liveProcessCount(agents)} currently running</strong></div>
      <div class="connection-detail"><span class="connection-state ${bridge.connected ? "is-connected" : ""}">${bridge.connected ? "Connected" : "Offline"}</span><span>${escapeHtml(bridgeSummary(bridge))}</span><span class="model-detail">${escapeHtml(bridge.provider || "Provider unavailable")} / ${escapeHtml(bridge.model || "Model unavailable")}</span></div>
    </section>

    ${renderCurrentProcessSection(visibleAgents, filter)}

    <section class="recurring-section" aria-label="Recurring agent jobs">
      <header class="section-row"><div><p class="section-kicker">Schedules</p><h2>Recurring Jobs</h2></div><span class="status-pill">${recurringJobs?.length || 0} configured</span></header>
      <div class="recurring-list">${jobs.map((job) => renderRecurringEditor(job, runs, onOpenReport)).join("")}</div>
    </section>

    ${renderPromptLab(runs || [])}

    <section class="agent-secondary-grid">
      <details class="panel-card collapsible-card"><summary class="panel-card-header"><div><p class="section-kicker">Obsidian Refer</p><h2>Evidence</h2></div><span class="status-pill">${notes.length} notes</span></summary><div class="vault-split"><aside class="vault-tree compact" aria-label="Vault notes">${notes.length ? notes.map((note) => renderVaultTreeItem(note, selected?.id)).join("") : '<div class="empty-lane">No vault notes.</div>'}</aside><section class="vault-preview compact">${selected ? renderVaultPreview(selected) : '<p class="muted-line">No note selected.</p>'}</section></div></details>
      <article class="panel-card"><header class="panel-card-header"><div><p class="section-kicker">Traceback</p><h2>Operator log</h2></div><span class="status-pill">${actions.length} records</span></header><div class="panel-card-body">${actions.slice(0, 8).map(renderAction).join("") || '<div class="empty-lane">No staged actions.</div>'}</div></article>
    </section>

    <div id="agentConsoleMount"></div>
  `;

  root.querySelector("[data-agent-filter]")?.addEventListener("change", (event) => onFilter(event.target.value));
  root.querySelector("[data-agent-sort]")?.addEventListener("change", (event) => onSort(event.target.value));
  const creator = root.querySelector("[data-agent-creator]");
  root.querySelector("[data-toggle-agent-creator]")?.addEventListener("click", () => {
    creator?.classList.toggle("is-hidden");
    creator?.querySelector("input[name='name']")?.focus();
  });
  root.querySelector("[data-cancel-agent-creator]")?.addEventListener("click", () => creator?.classList.add("is-hidden"));
  root.querySelector("[data-agent-create-type]")?.addEventListener("change", (event) => updateAgentCreatorForm(event.currentTarget.closest("form")));
  root.querySelector("[data-agent-create-time]")?.addEventListener("input", (event) => updateAgentCreatorForm(event.currentTarget.closest("form")));
  root.querySelector("[data-agent-create-cadence]")?.addEventListener("change", (event) => updateAgentCreatorForm(event.currentTarget.closest("form")));
  root.querySelector("[data-agent-create-weekday]")?.addEventListener("change", (event) => updateAgentCreatorForm(event.currentTarget.closest("form")));
  root.querySelector("[data-agent-creator]")?.querySelector("form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    updateAgentCreatorForm(event.currentTarget);
    onCreateAgent?.(new FormData(event.currentTarget));
  });
  root.querySelectorAll("[data-action-kind]").forEach((button) => button.addEventListener("click", () => onStageAction(button.dataset.actionKind)));
  root.querySelectorAll("[data-agent-row-action]").forEach((button) => button.addEventListener("click", () => onStageAction(button.dataset.agentRowAction, button.dataset.agentId)));
  root.querySelectorAll("[data-vault-id]").forEach((button) => button.addEventListener("click", () => onSelectVault(button.dataset.vaultId)));
  root.querySelectorAll("[data-edit-recurring]").forEach((button) => button.addEventListener("click", () => {
    const form = button.closest(".recurring-card")?.querySelector("[data-recurring-form]");
    form?.classList.remove("is-hidden");
    button.classList.add("is-hidden");
  }));
  root.querySelectorAll("[data-recurring-form]").forEach((form) => {
    updateScheduleForm(form);
    form.addEventListener("change", () => updateScheduleForm(form));
    form.addEventListener("input", () => updateScheduleForm(form));
    form.addEventListener("submit", (event) => { event.preventDefault(); updateScheduleForm(form); onSaveRecurring(new FormData(form)); });
  });
  root.querySelectorAll("[data-cancel-recurring]").forEach((button) => button.addEventListener("click", () => {
    const card = button.closest(".recurring-card");
    card?.querySelector("[data-recurring-form]")?.classList.add("is-hidden");
    card?.querySelector("[data-edit-recurring]")?.classList.remove("is-hidden");
  }));
  root.querySelectorAll("[data-run-recurring]").forEach((button) => button.addEventListener("click", () => onRunRecurring(jobs.find((job) => job.id === button.dataset.runRecurring) || jobs[0])));
  root.querySelector("[data-prompt-compare]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onComparePrompts({ promptA: formData.get("promptA")?.toString().trim(), promptB: formData.get("promptB")?.toString().trim() });
  });
}

function renderAgentCreator() {
  return `
    <section class="agent-creator is-hidden" data-agent-creator aria-label="Create agent">
      <header class="agent-creator-header"><div><p class="section-kicker">New workflow</p><h2>Create an agent</h2></div><button class="small-button" type="button" data-cancel-agent-creator>Cancel</button></header>
      <form class="agent-creator-form" data-agent-create-form>
        <div class="agent-creator-fields">
          <label><span>Name</span><input name="name" required placeholder="e.g. Daily IC briefing" /></label>
          <label><span>Type</span><select name="type" data-agent-create-type><option value="one-off">One-off Hermes run</option><option value="recurring">Recurring report</option><option value="task">Kanban task</option></select></label>
          <label data-agent-create-owner hidden><span>Owner</span><input name="owner" placeholder="Owner" /></label>
          <label data-agent-create-priority hidden><span>Priority</span><select name="priority"><option value="medium">Medium</option><option value="critical">Critical</option><option value="high">High</option><option value="low">Low</option></select></label>
          <label data-agent-create-due-date hidden><span>Due date</span><input name="dueDate" type="date" /></label>
        </div>
        <div class="agent-creator-fields" data-agent-create-recurring hidden>
          <label><span>Repeats</span><select name="cadence" data-agent-create-cadence><option value="weekdays">Weekdays</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="every-other-day">Every other day</option></select></label>
          <label><span>Time</span><input name="time" data-agent-create-time type="time" value="09:00" /></label>
          <label data-agent-create-weekday-field><span>Day</span><select name="weekday" data-agent-create-weekday>${WEEKDAYS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
          <label data-agent-create-monthday-field hidden><span>Day of month</span><input name="monthDay" type="number" min="1" max="31" value="1" /></label>
        </div>
        <input type="hidden" name="schedule" data-agent-create-schedule value="0 9 * * 1-5" />
        <p class="schedule-preview" data-agent-create-schedule-preview>Weekdays at 09:00 | Hermes schedule: 0 9 * * 1-5</p>
        <label><span data-agent-create-instruction-label>Instruction</span><textarea name="prompt" rows="3" required placeholder="What should Hermes do?"></textarea></label>
        <div class="agent-creator-actions"><p class="muted-line">Recurring reports are saved to Obsidian. One-off runs appear in Reports when complete. Tasks appear in Kanban.</p><button class="button primary" type="submit">Create agent</button></div>
      </form>
    </section>
  `;
}

function updateAgentCreatorForm(form) {
  if (!form) return;
  const field = (name) => form.querySelector(`[name="${name}"]`);
  const type = field("type").value;
  const recurring = form.querySelector("[data-agent-create-recurring]");
  const owner = form.querySelector("[data-agent-create-owner]");
  const priority = form.querySelector("[data-agent-create-priority]");
  const dueDate = form.querySelector("[data-agent-create-due-date]");
  const instructionLabel = form.querySelector("[data-agent-create-instruction-label]");
  recurring.hidden = type !== "recurring";
  owner.hidden = type !== "task";
  priority.hidden = type !== "task";
  dueDate.hidden = type !== "task";
  instructionLabel.textContent = type === "task" ? "Task detail" : "Instruction";
  if (type !== "recurring") return;
  const scheduleData = {
    cadence: field("cadence").value,
    time: field("time").value || "09:00",
    weekday: field("weekday").value,
    monthDay: field("monthDay").value || "1",
  };
  const schedule = scheduleFor(scheduleData);
  field("schedule").value = schedule;
  field("schedule").setAttribute("value", schedule);
  form.querySelector("[data-agent-create-schedule-preview]").textContent = `${scheduleDescription(scheduleData)} | Hermes schedule: ${schedule}`;
  form.querySelector("[data-agent-create-weekday-field]").hidden = !["weekly", "biweekly"].includes(scheduleData.cadence);
  form.querySelector("[data-agent-create-monthday-field]").hidden = scheduleData.cadence !== "monthly";
}

function renderRecurringEditor(job, runs = []) {
  const data = scheduleData(job);
  const isSaved = Boolean(job.id && job.status !== "draft");
  return `
    <article class="recurring-card">
      <header class="recurring-summary">
        <div><h3>${escapeHtml(job.name || "Daily Email Summary")}</h3><p class="muted-line">${escapeHtml(scheduleDescription(data))}</p></div>
        <div class="recurring-summary-meta"><span class="muted-line">${job.delivery === "origin" ? "Hermes origin" : "In app + email-ready"}</span><span class="status-pill status-${escapeHtml(job.status || "draft")}">${escapeHtml(job.status || "draft")}</span><button class="small-button" type="button" data-edit-recurring>Edit</button></div>
      </header>
      <div class="recurring-instruction">${escapeHtml(job.prompt || DEFAULT_EMAIL_PROMPT)}</div>
      ${renderBriefingLinks(job, runs)}
      <form class="recurring-form is-hidden" data-recurring-form aria-label="Edit ${escapeHtml(job.name || "recurring agent job")}">
        <input type="hidden" name="id" value="${escapeHtml(job.id || "")}" /><input type="hidden" name="schedule" value="${escapeHtml(job.schedule || "0 9 * * 1-5")}" data-schedule-value />
        <div class="recurring-fields">
          <label><span>Name</span><input name="name" value="${escapeHtml(job.name || "Daily Email Summary")}" /></label>
          <label><span>Repeats</span><select name="cadence" data-cadence>${CADENCES.map(([value, label]) => `<option value="${value}" ${value === data.cadence ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          <label><span>Time</span><input name="time" type="time" value="${escapeHtml(data.time)}" /></label>
          <label data-weekday-field><span>Day</span><select name="weekday">${WEEKDAYS.map(([value, label]) => `<option value="${value}" ${value === data.weekday ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          <label data-monthday-field><span>Day of month</span><input name="monthDay" type="number" min="1" max="31" value="${escapeHtml(data.monthDay)}" /></label>
          <label><span>Delivery</span><select name="delivery"><option value="local" ${(job.delivery || "local") === "local" ? "selected" : ""}>In app + email-ready preview</option><option value="origin" ${job.delivery === "origin" ? "selected" : ""}>Hermes origin channel</option></select></label>
        </div>
        <p class="schedule-preview" data-schedule-preview></p>
        <label><span>Instruction</span><textarea name="prompt" rows="4">${escapeHtml(job.prompt || DEFAULT_EMAIL_PROMPT)}</textarea></label>
        <div class="recurring-actions"><p class="muted-line">Results appear in How may I? and remain available in the run history.</p><div class="control-actions"><button class="button" type="button" data-run-recurring="${escapeHtml(job.id || "")}" ${isSaved ? "" : "disabled"}>Run now</button><button class="button" type="button" data-cancel-recurring>Cancel</button><button class="button primary" type="submit">Save to Hermes</button></div></div>
      </form>
    </article>
  `;
}

function renderBriefingLinks(job, runs) {
  const briefings = runs
    .filter((run) => run.reportId && run.status === "completed" && (!job.id || run.jobId === job.id))
    .sort((a, b) => new Date(b.completedAt || b.startedAt || 0) - new Date(a.completedAt || a.startedAt || 0))
    .filter((run, index, items) => items.findIndex((item) => item.reportId === run.reportId) === index)
    .slice(0, 3);
  if (!briefings.length) return '<div class="recurring-reports"><span class="muted-line">No briefing saved yet.</span></div>';
  return `<div class="recurring-reports"><span class="recurring-reports-label">Email briefings</span>${briefings.map((run) => `<button class="recurring-report-link" type="button" data-tab-target="reports" data-report-id="${escapeHtml(run.reportId)}">${escapeHtml(formatBriefingDate(run.completedAt || run.startedAt))}</button>`).join("")}</div>`;
}

function formatBriefingDate(value) {
  if (!value) return "Open briefing";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Open briefing";
  return date.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

function renderCurrentProcessSection(visibleAgents, filter) {
  return `
    <section class="agent-process-section" aria-label="Current agent processes">
      <div class="section-row"><div><p class="section-kicker">Live Report</p><h2>Current Agent Processes</h2></div><span class="muted-line">Historical sessions stay out of this report.</span></div>
      <div class="agent-queue-report">
        <div class="agent-report-head" aria-hidden="true"><span>Agent / assignment</span><span>Queue</span><span>Runtime</span><span>Actions</span></div>
        ${visibleAgents.map(renderAgentRow).join("") || `<div class="empty-lane">${filter === "running" ? "No agent processes currently running." : "No agent rows for this filter."}</div>`}
      </div>
    </section>
  `;
}

function renderPromptLab(runs) {
  const latestA = runs.find((run) => run.kind === "prompt-compare-a");
  const latestB = runs.find((run) => run.kind === "prompt-compare-b");
  return `<section class="panel-card prompt-lab" aria-label="Prompt comparison"><header class="panel-card-header"><div><p class="section-kicker">Prompt</p><h2>Prompt Iteration</h2></div><span class="muted-line">Test two instructions against the same connected vault.</span></header><form data-prompt-compare class="prompt-compare-form"><div class="prompt-compare-grid"><label><span>Version A</span><textarea name="promptA" rows="6" placeholder="More concise, with only actions and deadlines."></textarea></label><label><span>Version B</span><textarea name="promptB" rows="6" placeholder="More detail, grouped by company and relationship."></textarea></label></div><div class="recurring-actions"><p class="muted-line">These are preview runs. Review the outputs before saving a recurring instruction.</p><button class="button primary" type="submit">Run comparison</button></div></form><div class="prompt-results">${renderPromptResult("Version A", latestA)}${renderPromptResult("Version B", latestB)}</div></section>`;
}

function renderPromptResult(label, run) {
  if (!run) return `<article class="prompt-result"><span class="section-kicker">${label}</span><p class="muted-line">No preview run yet.</p></article>`;
  const statusClass = run.status === "completed" ? "is-complete" : run.status === "failed" ? "is-failed" : "is-running";
  return `<article class="prompt-result ${statusClass}"><div class="result-heading"><span class="section-kicker">${label}</span><span class="run-status">${escapeHtml(run.status)}</span></div><div class="run-output">${escapeHtml(run.output || run.error || "Hermes is working on this preview...")}</div></article>`;
}

function scheduleData(job) {
  const config = job.scheduleConfig || {};
  const parsed = parseCron(job.schedule || "0 9 * * 1-5");
  return { cadence: config.cadence || inferCadence(job.schedule) || "weekdays", time: config.time || `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`, weekday: config.weekday || parsed.weekday || "1", monthDay: config.monthDay || String(parsed.monthDay || "1") };
}

function parseCron(schedule) { const parts = String(schedule).trim().split(/\s+/); return { minute: Number(parts[0]) || 0, hour: Number(parts[1]) || 9, monthDay: Number(parts[2]) || 1, weekday: parts[4] && /^\d$/.test(parts[4]) ? parts[4] : "1" }; }
function inferCadence(schedule) { const value = String(schedule || ""); if (value === "0 9 * * 1-5") return "weekdays"; if (/^\d+ \d+ \* \* \*$/.test(value)) return "daily"; if (/^every 2d$/i.test(value)) return "every-other-day"; return "weekly"; }

function updateScheduleForm(form) {
  const data = { cadence: form.elements.cadence.value, time: form.elements.time.value || "09:00", weekday: form.elements.weekday.value, monthDay: form.elements.monthDay.value || "1" };
  const schedule = scheduleFor(data);
  form.elements.schedule.value = schedule;
  form.querySelector("[data-schedule-preview]").textContent = `${scheduleDescription(data)}  |  Hermes schedule: ${schedule}`;
  form.querySelector("[data-weekday-field]").hidden = !["weekly", "biweekly"].includes(data.cadence);
  form.querySelector("[data-monthday-field]").hidden = data.cadence !== "monthly";
}

function scheduleFor({ cadence, time, weekday, monthDay }) {
  const [hour, minute] = (time || "09:00").split(":").map(Number);
  if (cadence === "every-other-day") return "every 2d";
  if (cadence === "monthly") return `${minute} ${hour} ${Number(monthDay) || 1} * *`;
  if (["weekly", "biweekly"].includes(cadence)) return `${minute} ${hour} * * ${weekday}`;
  if (cadence === "weekdays") return `${minute} ${hour} * * 1-5`;
  return `${minute} ${hour} * * *`;
}

function scheduleDescription({ cadence, time, weekday, monthDay }) {
  const label = CADENCES.find(([value]) => value === cadence)?.[1] || "Scheduled";
  if (["weekly", "biweekly"].includes(cadence)) return `${label} on ${WEEKDAYS.find(([value]) => value === weekday)?.[1] || "Monday"} at ${time}`;
  if (cadence === "monthly") return `${label} on day ${monthDay} at ${time}`;
  return `${label} at ${time}`;
}

function defaultRecurringJob() { return { id: "", name: "Daily Email Summary", schedule: "0 9 * * 1-5", prompt: DEFAULT_EMAIL_PROMPT, delivery: "local", status: "draft", scheduleConfig: { cadence: "weekdays", time: "09:00", weekday: "1", monthDay: "1" } }; }
function renderAgentRow(agent) { const statusClass = agent.status === "Issue" || agent.category === "issue" ? "issue" : ["Queued", "Needs bridge", "Idle", "Recurring"].includes(agent.status) ? "warning" : ""; return `<article class="agent-queue-card"><div class="agent-line"><div class="agent-identity"><div class="agent-name">${escapeHtml(agent.name)}</div><p class="muted-line">${escapeHtml(agent.role)}</p></div><span class="agent-status ${statusClass}">${escapeHtml(agent.status)}</span></div><div class="agent-assignment"><p class="muted-line">${escapeHtml(agent.currentTask || "No current task")}</p><div class="progress-track" aria-label="${escapeHtml(agent.progress || 0)} percent complete"><div class="progress-fill" style="width: ${agent.progress || 0}%"></div></div></div><div class="agent-meta"><span class="agent-category">${escapeHtml(labelForFilter(agent.category || "system"))}</span><span><strong>${agent.queue || 0}</strong> queue depth</span><span>${escapeHtml(agent.runtime || agent.lastRun || "n/a")}</span></div><div class="agent-actions"><button class="small-button" type="button" data-agent-row-action="obsidian-ref" data-agent-id="${escapeHtml(agent.id)}">Obsidian ref</button><button class="small-button" type="button" data-agent-row-action="edit-agent" data-agent-id="${escapeHtml(agent.id)}">Edit</button><button class="small-button danger" type="button" data-agent-row-action="delete-agent" data-agent-id="${escapeHtml(agent.id)}">Delete</button></div></article>`; }
function liveProcessCount(agents) { return agents.filter((agent) => agent.status === "Running").length; }
function bridgeSummary(bridge = {}) { if (!bridge.connected) return "Open Setup to connect the local Hermes bridge."; const gateway = bridge.gatewayRunning ? "Hermes gateway running" : "Hermes gateway needs attention"; const vault = bridge.vaultName ? `Obsidian vault connected: ${bridge.vaultName}` : "Obsidian vault unavailable"; return `${gateway}; ${vault}.`; }
function renderVaultTreeItem(note, selectedId) { return `<button class="tree-item ${note.id === selectedId ? "is-active" : ""}" type="button" data-vault-id="${escapeHtml(note.id)}"><span>${escapeHtml(note.title)}</span><span>${escapeHtml(note.id)}</span></button>`; }
function renderVaultPreview(note) { return `<p class="section-kicker">${escapeHtml(note.path)}</p><h3>${escapeHtml(note.title)}</h3>${note.obsidianHref ? `<a class="modal-source-link" href="${escapeHtml(note.obsidianHref)}">Open note in Obsidian</a>` : ""}<div class="label-row"><span class="label">${escapeHtml(note.thread || "Vault note")}</span><span class="owner-pill">${escapeHtml(note.sender || "Obsidian")}</span></div><div class="markdown-preview">${renderMarkdownPreview(note.body)}</div>`; }
function renderAction(action) { return `<article class="feedback-card"><div class="feedback-row"><div><div class="feedback-title">${escapeHtml(action.title || action.kind)}</div><p class="muted-line">${escapeHtml(action.detail || action.status || "Staged locally")}</p></div><span class="status-pill">${escapeHtml(action.status || "staged")}</span></div></article>`; }
function filterAgents(agents, filter) { if (filter === "all") return agents; if (filter === "running") return agents.filter((agent) => agent.status === "Running"); return agents.filter((agent) => agent.category === filter || agent.status?.toLowerCase() === filter); }
function sortAgents(agents, sort) { const copy = [...agents]; if (sort === "queue") return copy.sort((a, b) => (b.queue || 0) - (a.queue || 0)); if (sort === "runtime") return copy.sort((a, b) => String(a.runtime || a.lastRun || "").localeCompare(String(b.runtime || b.lastRun || ""))); if (sort === "name") return copy.sort((a, b) => String(a.name).localeCompare(String(b.name))); return copy.sort((a, b) => String(a.status).localeCompare(String(b.status))); }
function labelForFilter(value) { return { running: "Currently Running", all: "All", current: "Current Tasks", recurring: "Recurring Jobs", thread: "Threads", issue: "Issues", system: "System" }[value] ?? value; }

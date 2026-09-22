import { getState, getHealth, syncState, createTask, updateCard, stageAction, runPrompt, runRecurringJob, saveRecurringJob, savePromptPresets, getReport, saveRunReport } from "./api.js?v=20260922-hosted";
import { getConnectionSettings, resetConnectionSettings, saveConnectionSettings } from "./connection.js?v=20260922-hosted";
import { TODAY } from "./config.js";
import { createInitialState, normalizeManualTask, saveStaticCards } from "./state.js";
import { columnTitle, escapeHtml, formatInputDate, makeSearchText } from "./utils.js";
import { renderAgentManagement } from "./views/agents.js?v=20260917-report-followup2";
import { renderConsole } from "./views/console.js";
import { renderKanban } from "./views/kanban.js";
import { renderOverview } from "./views/overview.js";
import { renderReports } from "./views/reports.js?v=20260917-report-followup2";
import { renderSetup } from "./views/setup.js?v=20260922-hosted";

const state = createInitialState();
const dom = {};
let runPollTimer = null;
let setupHealth = null;
let setupStatus = "idle";
const THEME_KEY = "hermes-manager-theme";

export function bootHermesManager() {
  cacheDom();
  bindEvents();
  applyTheme(localStorage.getItem(THEME_KEY) || "dark");
  render();
  loadBridgeState();
}

function cacheDom() {
  dom.board = document.querySelector("#boardView");
  dom.search = document.querySelector("#searchInput");
  dom.priority = document.querySelector("#urgencyFilter");
  dom.source = document.querySelector("#streamFilter");
  dom.themeToggle = document.querySelector("#themeToggle");
  dom.toast = document.querySelector("#toast");
}

function bindEvents() {
  dom.search.addEventListener("input", render);
  dom.priority.addEventListener("change", render);
  dom.source.addEventListener("change", render);
  dom.themeToggle.addEventListener("click", () => {
    const nextTheme = document.body.dataset.theme === "light" ? "dark" : "light";
    localStorage.setItem(THEME_KEY, nextTheme);
    applyTheme(nextTheme);
  });
  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab-target]");
    if (tab) {
      setTab(tab.dataset.tabTarget);
      if (tab.dataset.reportId) handleLoadReport(tab.dataset.reportId);
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id === "taskForm") {
      event.preventDefault();
      handleCreateTask(new FormData(event.target));
      event.target.reset();
    }
  });
}

async function loadBridgeState() {
  try {
    applyBridgeState(await getState());
    state.bridge.reachable = true;
    setupStatus = "connected";
    showToast("Synced with local Hermes.");
  } catch (error) {
    setupStatus = "failed";
    state.bridge = { connected: false, reachable: false, message: error.message || "Local bridge unavailable." };
    render();
  }
}

function applyBridgeState(nextState) {
  state.bridge = nextState.bridge ?? state.bridge;
  state.cards = nextState.cards?.length ? nextState.cards : state.cards;
  state.agents = nextState.agents?.length ? nextState.agents : state.agents;
  state.vault = nextState.vault ?? state.vault;
  state.actions = nextState.actions ?? state.actions;
  state.traceback = nextState.traceback ?? state.traceback;
  state.runs = nextState.runs ?? state.runs;
  state.reports = nextState.reports ?? state.reports;
  state.recurringJobs = nextState.recurringJobs ?? state.recurringJobs;
  state.promptPresets = nextState.promptPresets ?? state.promptPresets;
  state.cardPreferences = nextState.cardPreferences ?? state.cardPreferences;
  state.overview = nextState.overview ?? state.overview;
  state.selectedCardId = state.cards.find((card) => card.id === state.selectedCardId)?.id ?? null;
  state.selectedVaultId = state.selectedVaultId ?? state.vault.notes?.[0]?.id ?? null;
  if (state.selectedReportId && !state.reports.some((report) => report.id === state.selectedReportId)) {
    state.selectedReportId = null;
    state.selectedReport = null;
  }
  render();
  scheduleRunRefresh();
}

async function handleCreateTask(formData) {
  const task = {
    title: formData.get("title")?.toString().trim(),
    owner: formData.get("owner")?.toString().trim() || "Unassigned",
    priority: formData.get("priority")?.toString() || "medium",
    dueDate: formData.get("dueDate")?.toString() || formatInputDate(TODAY),
    summary: formData.get("summary")?.toString().trim() || "Manual dashboard task.",
  };

  if (!task.title) {
    showToast("Give the task a title first.");
    return;
  }

  if (state.bridge.connected) {
    try {
      applyBridgeState(await createTask(task));
      showToast("Task added.");
      return;
    } catch {
      showToast("Bridge write failed. Saving locally.");
    }
  }

  const card = normalizeManualTask({ ...task, id: `local-${Date.now()}`, status: "pending", sourceType: "task" });
  state.cards.unshift(card);
  saveStaticCards(state.cards);
  render();
}

function render() {
  renderSearchSuggestions();
  renderActiveView();
  updateConnectionLabels();
}

function renderSearchSuggestions() {
  const suggestions = [...new Set(state.cards.flatMap((card) => [card.company, card.sender].filter(Boolean)))].sort();
  const list = document.querySelector("#searchSuggestions");
  if (list) list.innerHTML = suggestions.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function renderActiveView() {
  if (state.activeTab === "agents") {
    renderAgentManagement({
      root: document.querySelector("#agentManagementContent"),
      agents: state.agents,
      vault: state.vault,
      actions: state.actions,
      recurringJobs: state.recurringJobs,
      runs: state.runs,
      bridge: state.bridge,
      sort: state.agentSort,
      filter: state.agentFilter,
      selectedVaultId: state.selectedVaultId,
      onSort: (sort) => {
        state.agentSort = sort;
        render();
      },
      onFilter: (filter) => {
        state.agentFilter = filter;
        render();
      },
      onStageAction: handleStageAction,
      onSaveRecurring: handleSaveRecurring,
      onRunRecurring: handleRunRecurring,
      onComparePrompts: handleComparePrompts,
      onOpenReport: handleOpenReport,
      onCreateAgent: handleCreateAgent,
      onSelectVault: (vaultId) => {
        state.selectedVaultId = vaultId;
        render();
      },
    });
    renderConsole({
      root: document.querySelector("#agentConsoleMount"),
      runs: state.runs,
      onRun: handleRun,
      onVoice: handleVoice,
      presets: state.promptPresets,
      onSavePreset: handleSavePreset,
      onToggleFavorite: handleTogglePresetFavorite,
      onUsePreset: handleUsePreset,
      onDeletePreset: handleDeletePreset,
    });
    return;
  }

  if (state.activeTab === "overview") {
    renderOverview({
      root: document.querySelector("#overviewPanel"),
      overview: state.overview,
      cards: state.cards,
      vault: state.vault,
      agents: state.agents,
      actions: state.actions,
      traceback: state.traceback,
    });
    return;
  }

  if (state.activeTab === "reports") {
    renderReports({
      root: document.querySelector("#reportsPanel"),
      runs: state.runs,
      agents: state.agents,
      vault: state.vault,
      traceback: state.traceback,
      bridge: state.bridge,
      reports: state.reports,
      selectedReport: state.selectedReport,
      onLoadReport: handleLoadReport,
      onSaveRunReport: handleSaveRunReport,
      onRunFollowUp: handleReportFollowUp,
    });
    return;
  }

  if (state.activeTab === "setup") {
    renderSetup({
      root: document.querySelector("#setupPanel"),
      connection: getConnectionSettings(),
      bridge: state.bridge,
      health: setupHealth,
      status: setupStatus,
      onTest: handleTestConnection,
      onSave: handleSaveConnection,
      onReset: handleResetConnection,
    });
    return;
  }

  renderKanban({
    root: dom.board,
      cards: getFilteredCards(),
    cardPreferences: state.cardPreferences,
    onMoveCard: handleMoveCard,
    onUpdateCardDueDate: handleUpdateCardDueDate,
  });
}

async function handleRun(prompt, kind = "console") {
  if (!prompt) {
    showToast("Write a request for Hermes first.");
    return;
  }
  if (!state.bridge.connected) {
    showToast("Start the local bridge before running Hermes.");
    return;
  }
  try {
    applyBridgeState(await runPrompt(prompt, kind));
    showToast("Hermes run started.");
  } catch {
    showToast("Hermes could not start this run.");
  }
}

async function handleCreateAgent(formData) {
  const type = formData.get("type")?.toString() || "one-off";
  const name = formData.get("name")?.toString().trim();
  const prompt = formData.get("prompt")?.toString().trim();
  if (!name || !prompt) {
    showToast("Add an agent name and instruction first.");
    return;
  }
  if (!state.bridge.connected) {
    showToast("Start the local bridge before creating an agent.");
    return;
  }

  try {
    if (type === "recurring") {
      applyBridgeState(await saveRecurringJob({
        id: "",
        name,
        schedule: formData.get("schedule")?.toString() || scheduleFromForm(formData),
        delivery: "local",
        prompt,
        reportConfig: { kind: "briefing", title: name },
        scheduleConfig: {
          cadence: formData.get("cadence")?.toString() || "weekdays",
          time: formData.get("time")?.toString() || "09:00",
          weekday: formData.get("weekday")?.toString() || "1",
          monthDay: formData.get("monthDay")?.toString() || "1",
        },
      }));
      showToast("Recurring agent created.");
      return;
    }

    if (type === "task") {
      applyBridgeState(await createTask({
        title: name,
        owner: formData.get("owner")?.toString().trim() || "Unassigned",
        priority: formData.get("priority")?.toString() || "medium",
        dueDate: formData.get("dueDate")?.toString() || "",
        summary: prompt,
      }));
      showToast("Kanban task created.");
      return;
    }

    applyBridgeState(await runPrompt(prompt, "agent-one-off", { title: name, agentType: "one-off" }));
    showToast("One-off agent run started.");
  } catch {
    showToast("Agent could not be created.");
  }
}

function scheduleFromForm(formData) {
  const [hour, minute] = (formData.get("time")?.toString() || "09:00").split(":").map(Number);
  const cadence = formData.get("cadence")?.toString() || "weekdays";
  const weekday = formData.get("weekday")?.toString() || "1";
  const monthDay = Number(formData.get("monthDay") || 1);
  if (cadence === "every-other-day") return "every 2d";
  if (cadence === "monthly") return `${minute} ${hour} ${monthDay} * *`;
  if (cadence === "weekly" || cadence === "biweekly") return `${minute} ${hour} * * ${weekday}`;
  if (cadence === "daily") return `${minute} ${hour} * * *`;
  return `${minute} ${hour} * * 1-5`;
}

async function handleRunRecurring(job) {
  if (!job?.id || !state.bridge.connected) {
    showToast("Start the local bridge before running a recurring report.");
    return;
  }
  try {
    applyBridgeState(await runRecurringJob(job.id));
    showToast("Recurring report run started.");
  } catch {
    showToast("Hermes could not start this recurring report.");
  }
}

async function handleLoadReport(reportId) {
  if (!reportId || !state.bridge.connected) return;
  state.selectedReportId = reportId;
  try {
    state.selectedReport = await getReport(reportId);
    render();
  } catch {
    showToast("Report could not be opened.");
  }
}

async function handleReportFollowUp({ question, report }) {
  const cleanQuestion = question?.toString().trim();
  if (!cleanQuestion || !report?.id) {
    showToast("Write a follow-up question first.");
    return;
  }
  if (!state.bridge.connected) {
    showToast("Start the local bridge before asking a follow-up.");
    return;
  }
  const sourceIds = report.sourceIds || report.metadata?.sourceIds || [];
  const context = [
    `Answer a follow-up question about the saved Hermes briefing \"${report.title || "Hermes report"}\".`,
    `Saved report ID: ${report.id}.`,
    sourceIds.length ? `Relevant source note IDs: ${sourceIds.join(", ")}.` : "Use the connected Obsidian vault to locate the relevant evidence.",
    "Use the connected Obsidian vault as the source of truth. Distinguish reported facts, unknowns, and interpretation. Cite source note IDs. Do not modify files or make investment decisions.",
    `Operator follow-up:\n${cleanQuestion}`,
  ].join("\n\n");
  try {
    applyBridgeState(await runPrompt(context, "report-follow-up", {
      title: `Follow-up: ${report.title || "Hermes report"}`,
      reportId: report.id,
      sourceIds,
    }));
    showToast("Follow-up sent to Hermes.");
  } catch {
    showToast("Hermes could not start the follow-up.");
  }
}

async function handleOpenReport(reportId) {
  if (!reportId || !state.bridge.connected) return;
  try {
    const report = await getReport(reportId);
    state.activeTab = "reports";
    state.selectedReportId = reportId;
    state.selectedReport = report;
    render();
  } catch {
    showToast("Report could not be opened.");
  }
}

async function handleSaveRunReport(runId, title) {
  if (!state.bridge.connected) {
    showToast("Start the local bridge before saving a report.");
    return;
  }
  try {
    applyBridgeState(await saveRunReport(runId, title));
    const saved = state.runs.find((run) => run.id === runId);
    state.selectedReportId = saved?.reportId || null;
    state.selectedReport = null;
    if (state.selectedReportId) await handleLoadReport(state.selectedReportId);
    showToast("Report saved to Obsidian.");
  } catch {
    showToast("Report could not be saved to Obsidian.");
  }
}

async function handleSaveRecurring(formData) {
  const job = {
    id: formData.get("id")?.toString(),
    name: formData.get("name")?.toString().trim(),
    schedule: formData.get("schedule")?.toString().trim(),
    delivery: formData.get("delivery")?.toString() || "local",
    prompt: formData.get("prompt")?.toString().trim(),
    reportConfig: {
      kind: "briefing",
      title: formData.get("name")?.toString().trim() || "Hermes briefing",
    },
    scheduleConfig: {
      cadence: formData.get("cadence")?.toString() || "weekdays",
      time: formData.get("time")?.toString() || "09:00",
      weekday: formData.get("weekday")?.toString() || "1",
      monthDay: formData.get("monthDay")?.toString() || "1",
    },
  };
  if (!job.name || !job.schedule || !job.prompt) {
    showToast("Complete the recurring job name, schedule, and prompt.");
    return;
  }
  if (!state.bridge.connected) {
    showToast("Start the local bridge before saving a Hermes job.");
    return;
  }
  try {
    applyBridgeState(await saveRecurringJob(job));
    showToast("Recurring prompt saved to Hermes.");
  } catch {
    showToast("Hermes could not save this recurring job.");
  }
}

async function handleSavePreset(preset) {
  const normalized = {
    id: preset.id || `prompt-${Date.now()}`,
    name: preset.name?.trim(),
    prompt: preset.prompt?.trim(),
    favorite: false,
    usageCount: 0,
  };
  if (!normalized.name || !normalized.prompt) {
    showToast("Give the prompt a name and instruction first.");
    return;
  }
  const existing = state.promptPresets.find((item) => item.id === normalized.id);
  if (existing) Object.assign(normalized, existing, { name: normalized.name, prompt: normalized.prompt });
  state.promptPresets = existing
    ? state.promptPresets.map((item) => item.id === normalized.id ? normalized : item)
    : [normalized, ...state.promptPresets];
  await persistPromptPresets("Prompt saved.");
}

async function handleTogglePresetFavorite(id) {
  state.promptPresets = state.promptPresets.map((preset) => preset.id === id ? { ...preset, favorite: !preset.favorite } : preset);
  await persistPromptPresets("Prompt favorite updated.");
}

async function handleDeletePreset(id) {
  state.promptPresets = state.promptPresets.filter((preset) => preset.id !== id);
  await persistPromptPresets("Prompt removed.");
}

function handleUsePreset(id) {
  const preset = state.promptPresets.find((item) => item.id === id);
  if (!preset) return;
  preset.usageCount = (preset.usageCount || 0) + 1;
  preset.lastUsedAt = new Date().toISOString();
  savePromptPresets(state.promptPresets).catch(() => undefined);
}

async function persistPromptPresets(successMessage) {
  if (!state.bridge.connected) {
    showToast("Start the local bridge to save prompt changes.");
    return;
  }
  try {
    applyBridgeState(await savePromptPresets(state.promptPresets));
    showToast(successMessage);
  } catch {
    showToast("Prompt library could not be saved.");
  }
}

function handleVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    showToast("Voice input is not available in this browser.");
    return;
  }
  const input = document.querySelector("#commandInput");
  const recognition = new Recognition();
  recognition.lang = "en-GB";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    input.value = event.results[0][0].transcript;
    input.focus();
    showToast("Voice request captured. Review it, then run Hermes.");
  };
  recognition.onerror = () => showToast("Voice input could not be captured.");
  recognition.start();
  showToast("Listening...");
}

function scheduleRunRefresh() {
  window.clearTimeout(runPollTimer);
  if (!state.runs?.some((run) => ["queued", "running"].includes(run.status))) return;
  runPollTimer = window.setTimeout(async () => {
    try {
      applyBridgeState(await syncState());
    } catch {
      scheduleRunRefresh();
    }
  }, 1500);
}

function getFilteredCards() {
  const query = dom.search.value.trim().toLowerCase();
  const priority = dom.priority.value;
  const source = dom.source.value;

  return state.cards.filter((card) => {
    const matchesQuery = !query || makeSearchText(card).includes(query);
    const matchesPriority = priority === "all" || card.priority === priority;
    const matchesSource = source === "all" || card.sourceType === source;
    return matchesQuery && matchesPriority && matchesSource;
  });
}

async function handleMoveCard(cardId, status) {
  const card = state.cards.find((item) => item.id === cardId);
  if (!card || card.status === status) return;

  card.status = status;
  render();
  if (state.bridge.connected) {
    try {
      applyBridgeState(await updateCard(cardId, { status }));
      showToast(`${card.title || card.company} moved to ${columnTitle(status)}.`);
      return;
    } catch {
      showToast("Bridge update failed. Keeping local move only.");
    }
  }

  saveStaticCards(state.cards);
  render();
}

async function handleUpdateCardDueDate(cardId, dueDate) {
  const card = state.cards.find((item) => item.id === cardId);
  if (!card || !dueDate) return;
  card.dueDate = dueDate;
  render();
  if (state.bridge.connected) {
    try {
      applyBridgeState(await updateCard(cardId, { dueDate }));
      showToast(`${card.title || card.company} due date updated.`);
      return;
    } catch {
      showToast("Bridge update failed. Keeping the local date.");
    }
  }
  saveStaticCards(state.cards);
  render();
}

async function handleStageAction(kind, targetId = "") {
  const title = actionTitle(kind);
  const detail = targetId ? `${title} requested for ${targetId}` : `${title} requested from Agent Management`;
  if (state.bridge.connected) {
    try {
      applyBridgeState(await stageAction({ kind, targetId, title, detail }));
      showToast(`${title} staged.`);
      return;
    } catch {
      showToast("Could not stage action in bridge.");
    }
  }
  state.actions.unshift({ kind, targetId, title, detail, status: "local" });
  render();
}

function setTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll("[data-tab-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.tabPanel === tab));
  document.querySelectorAll(".top-tab").forEach((button) => button.classList.toggle("is-active", button.dataset.tabTarget === tab));
  render();
}

function updateConnectionLabels() {
  const summary = document.querySelector("#syncConnectionSummary");
  if (summary) summary.textContent = state.bridge.connected
    ? connectionSummary(state.bridge)
    : "The local bridge is offline. Start server.py to connect Hermes and Obsidian.";
}

function connectionSummary(bridge) {
  const liveRuns = Number(bridge.activeSessions || 0);
  const gateway = bridge.gatewayRunning ? "Hermes gateway running" : "Hermes gateway status unavailable";
  const vault = bridge.vaultName ? `Obsidian: ${bridge.vaultName}` : "Obsidian vault unavailable";
  return `Browser -> local bridge -> Hermes CLI; ${gateway}; ${liveRuns} live agent run${liveRuns === 1 ? "" : "s"}; ${vault}.`;
}

async function handleTestConnection(connection) {
  setupStatus = "testing";
  render();
  try {
    setupHealth = await getHealth(connection);
    setupStatus = "connected";
    showToast("Local bridge reached successfully.");
  } catch (error) {
    setupHealth = null;
    setupStatus = "failed";
    showToast(error.message || "Local bridge could not be reached.");
  }
  render();
}

async function handleSaveConnection(connection) {
  try {
    const saved = saveConnectionSettings(connection);
    await handleTestConnection(saved);
    if (setupStatus === "connected") await loadBridgeState();
  } catch (error) {
    setupStatus = "failed";
    showToast(error.message || "Connection settings are invalid.");
    render();
  }
}

function handleResetConnection() {
  resetConnectionSettings();
  setupHealth = null;
  setupStatus = "idle";
  state.bridge = { connected: false, reachable: false, message: "Connection settings reset." };
  render();
  showToast("Connection settings reset.");
}

function actionTitle(kind) {
  return {
    "new-agent": "New agent",
    "delete-agent": "Delete agent",
    "edit-agent": "Edit agent",
  }[kind] ?? "Action";
}

async function handleComparePrompts({ promptA, promptB }) {
  const prompts = [
    [promptA, "prompt-compare-a"],
    [promptB, "prompt-compare-b"],
  ].filter(([prompt]) => prompt);
  if (prompts.length !== 2) {
    showToast("Add both prompt versions before running a comparison.");
    return;
  }
  if (!state.bridge.connected) {
    showToast("Start the local bridge before testing prompts.");
    return;
  }
  try {
    for (const [prompt, kind] of prompts) {
      applyBridgeState(await runPrompt(prompt, kind));
    }
    showToast("Prompt comparison runs started.");
  } catch {
    showToast("Hermes could not start the comparison.");
  }
}

function applyTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = nextTheme;
  if (dom.themeToggle) {
    dom.themeToggle.textContent = nextTheme === "light" ? "Dark mode" : "Light mode";
    dom.themeToggle.setAttribute("aria-label", `Switch to ${nextTheme === "light" ? "dark" : "light"} mode`);
  }
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => dom.toast.classList.remove("is-visible"), 2800);
}

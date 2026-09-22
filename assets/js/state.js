import { TODAY } from "./config.js";
import { formatInputDate } from "./utils.js";

const STORAGE_KEY = "hermes-manager-static-tasks";
const CARD_PREFERENCES_KEY = "hermes-manager-card-preferences";
const defaultCardPreferences = { summary: true, nextAction: true, owner: true, dueDate: true, source: true, labels: true };

const fallbackPromptPresets = [
  { id: "recent-email-summary", name: "Recent email summary", prompt: "Give me a concise summary of my recent emails.", favorite: true, usageCount: 0 },
  { id: "kanban-next-actions", name: "Kanban next actions", prompt: "Which Kanban items need doing next, and what is the owner and due date for each?", favorite: false, usageCount: 0 },
  { id: "lp-follow-ups", name: "LP follow-ups", prompt: "Prepare my LP and relationship follow-ups from the latest email notes.", favorite: false, usageCount: 0 },
];

const fallbackCards = [
  {
    id: "local-001",
    title: "Connect Hermes demo vault",
    company: "Hermes Control",
    sender: "Local bridge",
    sourceType: "task",
    status: "active",
    priority: "high",
    owner: "Operator",
    dueDate: "2026-09-16",
    summary: "Read the Obsidian demo vault and present inbox items inside this dashboard.",
    nextAction: "Run the local bridge server so the UI can load real vault notes.",
    labels: ["Bridge", "Obsidian", "Hermes"],
    source: "ACE_Demo/Vault/Inbox/index.json",
  },
];

const fallbackAgents = [
  {
    id: "gateway",
    name: "Hermes Gateway",
    role: "Local Hermes gateway process and routing layer.",
    status: "Needs bridge",
    progress: 35,
    queue: 0,
    currentTask: "Start server.py to read local Hermes state.",
    lastRun: "Static fallback",
    category: "current",
  },
];

export function createInitialState() {
  return {
    cards: loadStaticCards(),
    agents: fallbackAgents,
    vault: { name: "Not connected", notes: [] },
    overview: [],
    actions: [],
    traceback: [],
    runs: [],
    reports: [],
    recurringJobs: [],
    promptPresets: fallbackPromptPresets.map((preset) => ({ ...preset })),
    cardPreferences: loadCardPreferences(),
    bridge: { connected: false, reachable: false, message: "Open Setup to connect the local bridge." },
    selectedCardId: null,
    selectedVaultId: null,
    selectedReportId: null,
    selectedReport: null,
    activeTab: "dealflow",
    agentSort: "status",
    agentFilter: "running",
  };
}

export function loadCardPreferences() {
  try {
    return { ...defaultCardPreferences, ...JSON.parse(localStorage.getItem(CARD_PREFERENCES_KEY) || "{}") };
  } catch {
    return { ...defaultCardPreferences };
  }
}

export function saveCardPreferences(preferences) {
  localStorage.setItem(CARD_PREFERENCES_KEY, JSON.stringify({ ...defaultCardPreferences, ...preferences }));
}

export function loadStaticCards() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return fallbackCards.map((card) => ({ ...card }));
  }

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length ? parsed : fallbackCards.map((card) => ({ ...card }));
  } catch {
    return fallbackCards.map((card) => ({ ...card }));
  }
}

export function saveStaticCards(cards) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards.filter((card) => card.sourceType === "task")));
}

export function normalizeManualTask(task) {
  return {
    id: task.id,
    title: task.title,
    company: task.company || task.title,
    sender: task.sender || "Dashboard",
    sourceType: task.sourceType || "task",
    status: task.status || "pending",
    priority: task.priority || "medium",
    owner: task.owner || "Unassigned",
    dueDate: task.dueDate || formatInputDate(TODAY),
    summary: task.summary || "Manual dashboard task.",
    nextAction: task.nextAction || "Move this through the workflow as work progresses.",
    labels: task.labels || ["Manual"],
    source: task.source || "Dashboard",
  };
}

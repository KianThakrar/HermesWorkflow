import { connectionHeaders, getConnectionSettings, resolveApiUrl } from "./connection.js";

// All operational requests are routed to the configured local bridge. Vercel
// only serves the interface; Hermes and Obsidian remain on the user's machine.
export async function getState() {
  return requestJson("/api/state", { cache: "no-store" }, "Bridge");
}

export async function syncState() {
  return requestJson("/api/sync", { method: "POST" }, "Sync");
}

export async function createTask(task) {
  return requestJson("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  }, "Create task");
}

export async function updateCardStatus(cardId, status) {
  return updateCard(cardId, { status });
}

export async function updateCard(cardId, updates) {
  return requestJson(`/api/cards/${encodeURIComponent(cardId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  }, "Update card");
}

export async function stageAction(action) {
  return requestJson("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  }, "Stage action");
}

export async function runPrompt(prompt, kind = "console", metadata = {}) {
  return requestJson("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, kind, metadata }),
  }, "Run Hermes");
}

export async function runRecurringJob(jobId) {
  return requestJson(`/api/recurring/${encodeURIComponent(jobId)}/run`, { method: "POST" }, "Run recurring job");
}

export async function saveRecurringJob(job) {
  return requestJson("/api/recurring", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  }, "Save recurring job");
}

export async function savePromptPresets(presets) {
  return requestJson("/api/presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ presets }),
  }, "Save prompt presets");
}

export async function getReport(reportId) {
  return requestJson(`/api/reports/${encodeURIComponent(reportId)}`, { cache: "no-store" }, "Load report");
}

export async function saveRunReport(runId, title = "") {
  return requestJson(`/api/runs/${encodeURIComponent(runId)}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }, "Save report");
}

export async function getHealth(connection = getConnectionSettings()) {
  return requestJson("/api/health", { cache: "no-store" }, "Connection test", connection);
}

async function requestJson(url, options = {}, label = "Request", connection = getConnectionSettings()) {
  const requestUrl = resolveApiUrl(url, connection.bridgeUrl);
  const requestOptions = { ...options, headers: connectionHeaders(options.headers, connection.token) };
  if (typeof window.fetch === "function") {
    const response = await window.fetch(requestUrl, requestOptions);
    if (!response.ok) {
      throw new Error(`${label} returned ${response.status}`);
    }
    return response.json();
  }
  return requestJsonWithXhr(requestUrl, requestOptions, label);
}

function requestJsonWithXhr(url, options, label) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(options.method || "GET", url, true);
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, name) => request.setRequestHeader(name, value));
    } else {
      Object.entries(options.headers || {}).forEach(([name, value]) => request.setRequestHeader(name, value));
    }
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`${label} returned ${request.status}`));
        return;
      }
      try {
        resolve(JSON.parse(request.responseText));
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(new Error(`${label} failed`));
    request.send(options.body || null);
  });
}

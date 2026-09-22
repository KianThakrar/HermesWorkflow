import { escapeHtml } from "../utils.js";

export function renderConsole({ root, runs, presets, onRun, onVoice, onSavePreset, onToggleFavorite, onUsePreset, onDeletePreset }) {
  const recentRuns = (runs || []).slice(0, 2);
  const sortedPresets = [...(presets || [])].sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.usageCount || 0) - (a.usageCount || 0));
  root.innerHTML = `
    <section class="console-panel" aria-label="Ask Hermes console">
      <div class="console-heading"><div><p class="section-kicker">Local Hermes Console</p><h2>How may I?</h2></div><span class="console-status">Reads the connected Obsidian vault</span></div>
      <form id="commandForm" class="command-form" aria-label="Ask Hermes">
        <label class="sr-only" for="commandInput">Ask Hermes</label>
        <textarea id="commandInput" name="prompt" rows="3" placeholder="Ask Hermes to summarise my recent emails, surface urgent deal items, or prepare a follow-up..."></textarea>
        <div class="prompt-shelf">
          <div class="prompt-shelf-heading"><span>Saved prompts</span><button class="small-button" type="button" data-manage-prompts>Manage</button></div>
          <div class="prompt-presets">${sortedPresets.map(renderPreset).join("") || '<span class="muted-line">No saved prompts yet.</span>'}</div>
        </div>
        <div class="command-footer"><div></div><div class="command-actions"><button id="voiceButton" class="button" type="button">Voice input</button><button class="button primary" type="submit">Run with Hermes</button></div></div>
      </form>
      <section class="prompt-manager is-hidden" data-prompt-manager aria-label="Manage saved prompts">
        <div class="prompt-manager-heading"><div><span class="section-kicker">Prompt Library</span><strong>Edit or add a saved prompt</strong></div><button class="small-button" type="button" data-close-prompts>Close</button></div>
        <form class="prompt-edit-form" data-prompt-form>
          <input type="hidden" name="id" />
          <label><span>Name</span><input name="name" required placeholder="e.g. IC meeting prep" /></label>
          <label><span>Prompt</span><textarea name="prompt" rows="3" required placeholder="What should Hermes prepare for you?"></textarea></label>
          <div class="prompt-manager-actions"><button class="button" type="button" data-new-prompt>New prompt</button><button class="button primary" type="submit">Save prompt</button></div>
        </form>
        <div class="prompt-library">${sortedPresets.map(renderPresetRow).join("")}</div>
      </section>
      <div class="run-list" aria-live="polite">${recentRuns.map(renderRun).join("") || '<div class="console-empty">Your two most recent Hermes results will appear here.</div>'}</div>
    </section>
  `;

  const manager = root.querySelector("[data-prompt-manager]");
  const form = root.querySelector("[data-prompt-form]");
  root.querySelector("#commandForm")?.addEventListener("submit", (event) => { event.preventDefault(); onRun(new FormData(event.currentTarget).get("prompt")?.toString().trim()); });
  root.querySelector("#voiceButton")?.addEventListener("click", onVoice);
  root.querySelector("[data-manage-prompts]")?.addEventListener("click", () => manager?.classList.remove("is-hidden"));
  root.querySelector("[data-close-prompts]")?.addEventListener("click", () => manager?.classList.add("is-hidden"));
  root.querySelector("[data-new-prompt]")?.addEventListener("click", () => { form.reset(); form.elements.id.value = ""; });
  root.querySelectorAll("[data-suggestion]").forEach((button) => button.addEventListener("click", () => usePreset(button.dataset.suggestion, button.dataset.presetId)));
  root.querySelectorAll("[data-edit-preset]").forEach((button) => button.addEventListener("click", () => {
    const preset = (presets || []).find((item) => item.id === button.dataset.editPreset);
    if (!preset) return;
    form.elements.id.value = preset.id;
    form.elements.name.value = preset.name;
    form.elements.prompt.value = preset.prompt;
    manager?.classList.remove("is-hidden");
  }));
  root.querySelectorAll("[data-favorite-preset]").forEach((button) => button.addEventListener("click", () => onToggleFavorite(button.dataset.favoritePreset)));
  root.querySelectorAll("[data-delete-preset]").forEach((button) => button.addEventListener("click", () => onDeletePreset(button.dataset.deletePreset)));
  form?.addEventListener("submit", (event) => { event.preventDefault(); onSavePreset(Object.fromEntries(new FormData(event.currentTarget))); });

  function usePreset(prompt, presetId) {
    const input = root.querySelector("#commandInput");
    input.value = prompt;
    input.focus();
    if (presetId) onUsePreset(presetId);
  }
}

function renderPreset(preset) {
  return `<button class="suggestion-button preset-button" type="button" data-suggestion="${escapeHtml(preset.prompt)}" data-preset-id="${escapeHtml(preset.id)}"><span>${escapeHtml(preset.name)}</span>${preset.favorite ? '<span class="preset-star" aria-label="Favorite">*</span>' : ""}</button>`;
}

function renderPresetRow(preset) {
  return `<article class="prompt-library-row"><div><strong>${escapeHtml(preset.name)}</strong><p class="muted-line">${escapeHtml(preset.prompt)}</p></div><div class="prompt-row-actions"><button class="icon-button" type="button" data-favorite-preset="${escapeHtml(preset.id)}" aria-label="${preset.favorite ? "Remove favorite" : "Favorite"}">${preset.favorite ? "*" : "+"}</button><button class="small-button" type="button" data-edit-preset="${escapeHtml(preset.id)}">Edit</button><button class="icon-button danger" type="button" data-delete-preset="${escapeHtml(preset.id)}" aria-label="Delete prompt">x</button></div></article>`;
}

function renderRun(run) {
  const statusClass = run.status === "completed" ? "completed" : run.status === "failed" ? "failed" : "running";
  const detail = run.status === "completed" ? run.output : run.status === "failed" ? run.error || "Hermes could not complete this request." : "Hermes is working on this request...";
  return `<article class="run-card ${statusClass}"><div class="run-card-header"><span class="run-status">${escapeHtml(run.status)}</span><time datetime="${escapeHtml(run.startedAt || "")}">${escapeHtml(formatRunTime(run.startedAt))}</time></div><p class="run-prompt">${escapeHtml(run.prompt)}</p><div class="run-output">${escapeHtml(detail || "No output returned.")}</div></article>`;
}

function formatRunTime(value) {
  if (!value) return "just now";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "recent" : date.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

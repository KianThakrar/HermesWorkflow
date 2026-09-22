import { PRIORITY_COLORS } from "./config.js";
import { capitalize, columnTitle, escapeHtml, formatDue, sourceLabel } from "./utils.js";

export function renderDetailModal({ root, card, onClose, onAdvance, onAgents }) {
  if (!card) {
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = "";
    return;
  }

  root.setAttribute("aria-hidden", "false");
  const sourceHref = card.sourceHref || "";
  const sourceText = card.sourcePath || card.emailRef || card.obsidianRef || card.source || "Open linked reference";

  root.innerHTML = `
    <div class="modal-titlebar" data-modal-handle>
      <strong>${escapeHtml(card.title || card.company)}</strong>
      <button class="modal-close" type="button" data-close-detail aria-label="Close detail">X</button>
    </div>
    <div class="drawer-content">
      <p class="drawer-kicker">${sourceLabel(card.sourceType)} / ${columnTitle(card.status)}</p>
      <h2>${escapeHtml(card.title || card.company)}</h2>
      <p class="drawer-subtitle">${escapeHtml(card.sender)} / ${formatDue(card.dueDate)}</p>
      <div class="label-row">
        <span class="priority-pill" style="--priority-color: ${PRIORITY_COLORS[card.priority] || PRIORITY_COLORS.medium}">${capitalize(card.priority)}</span>
        <span class="status-pill">${columnTitle(card.status)}</span>
        <span class="owner-pill">${escapeHtml(card.owner)}</span>
      </div>
      <section class="drawer-panel"><h3>Summary</h3><p>${escapeHtml(card.summary)}</p></section>
      <section class="drawer-panel"><h3>Next Action</h3><p>${escapeHtml(card.nextAction)}</p></section>
      <section class="drawer-panel"><h3>Source</h3><p>${escapeHtml(card.source)}</p><a class="modal-source-link" href="${escapeHtml(sourceHref || "#")}" ${sourceHref ? 'target="_blank" rel="noreferrer"' : 'data-source-ref=""'}>${escapeHtml(sourceText)}</a></section>
      <div class="label-row">${(card.labels || []).map((label) => `<span class="label">${escapeHtml(label)}</span>`).join("")}</div>
      <div class="drawer-actions">
        <button class="small-button" type="button" data-move-next>Move Forward</button>
        <button class="small-button" type="button" data-open-agents>Obsidian Refer</button>
        <button class="small-button" type="button" data-open-agents>Agents</button>
      </div>
    </div>
  `;

  root.querySelector("[data-close-detail]")?.addEventListener("click", onClose);
  root.querySelector("[data-move-next]")?.addEventListener("click", () => onAdvance(card.id));
  root.querySelector("[data-source-ref]")?.addEventListener("click", (event) => {
    event.preventDefault();
    onAgents();
  });
  root.querySelectorAll("[data-open-agents]").forEach((button) => button.addEventListener("click", onAgents));
}

export function enableModalDrag(root) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("[data-modal-handle]")) {
      return;
    }
    const rect = root.getBoundingClientRect();
    dragging = true;
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    root.style.transform = "none";
  });

  document.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }
    const maxLeft = window.innerWidth - root.offsetWidth - 8;
    const maxTop = window.innerHeight - root.offsetHeight - 8;
    root.style.left = `${Math.max(8, Math.min(maxLeft, event.clientX - offsetX))}px`;
    root.style.top = `${Math.max(8, Math.min(maxTop, event.clientY - offsetY))}px`;
  });

  document.addEventListener("pointerup", () => {
    dragging = false;
  });
}

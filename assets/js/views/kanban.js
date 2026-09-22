import { COLUMNS, STATUS_COLORS } from "../config.js";
import { escapeHtml, formatCalendarDate, formatDue, priorityRank, sourceLabel } from "../utils.js";

export function renderKanban({ root, cards, cardPreferences, onMoveCard, onUpdateCardDueDate }) {
  root.innerHTML = COLUMNS.map((column) => {
    const columnCards = cards
      .filter((card) => card.status === column.id)
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || new Date(a.dueDate) - new Date(b.dueDate));

    return `
      <article class="lane workflow-lane" data-column-id="${column.id}" style="--lane-color: ${column.color}">
        <header class="lane-header">
          <div>
            <div class="lane-title">
              <span class="lane-dot" aria-hidden="true"></span>
              <span>${column.title}</span>
            </div>
            <p class="lane-subtitle">${column.subtitle}</p>
          </div>
          <span class="lane-count">${columnCards.length}</span>
        </header>
        <div class="lane-body">
          ${columnCards.length ? columnCards.map((card) => renderCard(card, cardPreferences, onUpdateCardDueDate)).join("") : '<div class="empty-lane">No items here</div>'}
        </div>
      </article>
    `;
  }).join("");

  root.querySelectorAll(".deal-card").forEach((cardElement) => {
    cardElement.addEventListener("dragstart", (event) => {
      cardElement.classList.add("is-dragging");
      event.dataTransfer.setData("text/plain", cardElement.dataset.cardId);
      event.dataTransfer.effectAllowed = "move";
    });
    cardElement.addEventListener("dragend", () => cardElement.classList.remove("is-dragging"));
  });

  root.querySelectorAll("[data-edit-date]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const input = document.createElement("input");
      input.type = "date";
      input.value = button.dataset.date || "";
      input.className = "date-editor";
      input.setAttribute("aria-label", "Edit due date");
      button.replaceWith(input);
      input.focus();
      input.addEventListener("change", () => onUpdateCardDueDate(button.dataset.cardId, input.value));
    });
  });

  root.querySelectorAll(".lane").forEach((lane) => {
    lane.addEventListener("dragover", (event) => {
      event.preventDefault();
      lane.classList.add("is-over");
    });
    lane.addEventListener("dragleave", () => lane.classList.remove("is-over"));
    lane.addEventListener("drop", (event) => {
      event.preventDefault();
      lane.classList.remove("is-over");
      onMoveCard(event.dataTransfer.getData("text/plain"), lane.dataset.columnId);
    });
  });
}

function renderCard(card, preferences = {}, onUpdateCardDueDate) {
  const source = sourceLabel(card.sourceType);
  const referenceDetail = [
    card.sourcePath || card.source,
    card.company && `Company: ${card.company}`,
    card.sender && `From: ${card.sender}`,
    card.thread && `Thread: ${card.thread}`,
  ].filter(Boolean).join(" | ");
  const sourceMarkup = card.sourceHref
    ? `<a class="source-link" title="${escapeHtml(referenceDetail || "Open source reference")}" aria-label="Open ${escapeHtml(source)} reference: ${escapeHtml(referenceDetail)}" href="${escapeHtml(card.sourceHref)}" target="_blank" rel="noreferrer">${source} ref</a>`
    : `<span class="source-link" title="${escapeHtml(referenceDetail || "Source reference")}">${source} ref</span>`;
  return `
    <article class="deal-card" draggable="true" data-card-id="${escapeHtml(card.id)}" style="--status-color: ${STATUS_COLORS[card.status] || STATUS_COLORS.pending}">
      <div class="card-topline">
        <span class="company">${escapeHtml(card.title || card.company)}</span>
      </div>
      ${preferences.summary !== false ? `<p class="card-summary">${escapeHtml(card.summary)}</p>` : ""}
      ${preferences.nextAction !== false ? `<p class="card-action">${escapeHtml(card.nextAction)}</p>` : ""}
      <div class="card-meta">
        ${preferences.owner !== false ? `<span>${escapeHtml(card.owner)}</span>` : "<span></span>"}
        ${preferences.dueDate !== false ? `<button class="due-date-button ${card.dueDate && formatDue(card.dueDate) === "Overdue" ? "is-overdue" : ""}" type="button" data-edit-date data-card-id="${escapeHtml(card.id)}" data-date="${escapeHtml(card.dueDate || "")}" title="Edit due date">${formatCalendarDate(card.dueDate)}</button>` : ""}
      </div>
      ${preferences.source !== false || preferences.labels !== false ? `<div class="label-row">${preferences.source !== false ? sourceMarkup : ""}${preferences.labels !== false ? (card.labels || []).slice(0, 3).map((label) => `<span class="label">${escapeHtml(label)}</span>`).join("") : ""}</div>` : ""}
    </article>
  `;
}

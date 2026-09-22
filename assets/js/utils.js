import { COLUMNS, PRIORITY_ORDER, TODAY } from "./config.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function priorityRank(priority) {
  return PRIORITY_ORDER[priority] ?? 4;
}

export function daysUntil(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return Math.ceil((date - TODAY) / 86_400_000);
}

export function formatDue(dateString) {
  const days = daysUntil(dateString);
  if (days < 0) return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${dateString}T00:00:00`));
}

export function formatCalendarDate(dateString) {
  if (!dateString) return "No date";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return dateString;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function formatInputDate(date) {
  return date.toISOString().slice(0, 10);
}

export function columnTitle(status) {
  return COLUMNS.find((column) => column.id === status)?.title ?? status;
}

export function sourceLabel(sourceType) {
  return { vault: "Obsidian", hermes: "Hermes", task: "Task", action: "Action" }[sourceType] ?? "Item";
}

export function capitalize(value = "") {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function renderMarkdownPreview(markdown = "") {
  return escapeHtml(markdown.slice(0, 1800)).replace(/\n/g, "<br>");
}

export function makeSearchText(card) {
  return [
    card.title,
    card.company,
    card.sender,
    card.summary,
    card.nextAction,
    card.owner,
    card.labels?.join(" "),
    card.source,
  ]
    .join(" ")
    .toLowerCase();
}

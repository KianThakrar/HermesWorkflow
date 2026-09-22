// Shared configuration for the browser app. Keep workflow names here so
// designers and operators can change language without digging through renderers.
export const TODAY = new Date("2026-09-16T00:00:00");

export const COLUMNS = [
  { id: "pending", title: "Pending", subtitle: "Not started", color: "transparent" },
  { id: "active", title: "In Progress", subtitle: "Being worked", color: "#e0a15b" },
  { id: "completed", title: "Completed", subtitle: "Done and logged", color: "#72b89a" },
];

export const PRIORITY_COLORS = {
  critical: "#ff5d5d",
  high: "#f4b64a",
  medium: "#66a9ff",
  low: "#44d09b",
};

// Workflow state is the visual signal on cards; priority remains a sorting/input concern.
export const STATUS_COLORS = {
  pending: "transparent",
  active: "#e0a15b",
  completed: "#72b89a",
};

export const PRIORITY_ORDER = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

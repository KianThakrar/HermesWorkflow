const BRIDGE_URL_KEY = "hermes-manager-bridge-url";
const BRIDGE_TOKEN_KEY = "hermes-manager-bridge-token";

export function defaultBridgeUrl() {
  if (window.location.protocol === "http:" && ["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port === "4174") {
    return window.location.origin;
  }
  return "http://127.0.0.1:4174";
}

export function getConnectionSettings() {
  return {
    bridgeUrl: localStorage.getItem(BRIDGE_URL_KEY) || defaultBridgeUrl(),
    token: localStorage.getItem(BRIDGE_TOKEN_KEY) || "",
  };
}

export function saveConnectionSettings({ bridgeUrl, token = "" }) {
  const normalized = normalizeBridgeUrl(bridgeUrl);
  localStorage.setItem(BRIDGE_URL_KEY, normalized);
  if (token.trim()) localStorage.setItem(BRIDGE_TOKEN_KEY, token.trim());
  else localStorage.removeItem(BRIDGE_TOKEN_KEY);
  return { bridgeUrl: normalized, token: token.trim() };
}

export function resetConnectionSettings() {
  localStorage.removeItem(BRIDGE_URL_KEY);
  localStorage.removeItem(BRIDGE_TOKEN_KEY);
  return getConnectionSettings();
}

export function resolveApiUrl(path, bridgeUrl = getConnectionSettings().bridgeUrl) {
  const base = `${normalizeBridgeUrl(bridgeUrl)}/`;
  return new URL(path.replace(/^\//, ""), base).toString();
}

export function connectionHeaders(headers = {}, token = getConnectionSettings().token) {
  const result = new Headers(headers);
  if (token) result.set("X-Hermes-Token", token);
  return result;
}

export function normalizeBridgeUrl(value) {
  const raw = String(value || "").trim() || defaultBridgeUrl();
  const candidate = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Bridge URL must use HTTP or HTTPS.");
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

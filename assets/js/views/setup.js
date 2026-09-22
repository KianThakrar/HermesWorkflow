import { escapeHtml } from "../utils.js";

export function renderSetup({ root, connection, bridge = {}, health, status, onTest, onSave, onReset }) {
  const checks = health?.checks || {};
  root.innerHTML = `
    <div class="panel-heading setup-heading">
      <div><p class="section-kicker">Local connection</p><h2>Setup</h2></div>
      <span class="connection-badge ${status === "connected" ? "is-connected" : ""}">${statusLabel(status)}</span>
    </div>
    <div class="setup-layout">
      <section class="setup-primary" aria-labelledby="bridgeSetupTitle">
        <div class="setup-copy">
          <p class="section-kicker">This device</p>
          <h3 id="bridgeSetupTitle">Connect the local Hermes bridge</h3>
          <p>The hosted interface sends operational requests to a bridge running only on this laptop. Hermes, email notes, and Obsidian files remain local.</p>
        </div>
        <form class="setup-form" data-connection-form>
          <label><span>Bridge URL</span><input name="bridgeUrl" type="url" value="${escapeHtml(connection.bridgeUrl)}" placeholder="http://127.0.0.1:4174" required /></label>
          <label><span>Pairing token <small>optional</small></span><input name="token" type="password" value="${escapeHtml(connection.token)}" autocomplete="off" placeholder="Matches HERMES_MANAGER_TOKEN" /></label>
          <div class="setup-actions">
            <button class="small-button" type="button" data-test-connection>Test connection</button>
            <button class="small-button primary" type="submit">Save connection</button>
            <button class="small-button" type="button" data-reset-connection>Reset</button>
          </div>
        </form>
        <div class="setup-command" aria-label="Local bridge start command">
          <span>Local bridge</span>
          <code>python3 server.py</code>
        </div>
      </section>
      <aside class="setup-diagnostics" aria-label="Connection diagnostics">
        ${diagnostic("Bridge", checks.bridge?.ok ?? bridge.reachable, checks.bridge?.detail || bridge.message)}
        ${diagnostic("Hermes CLI", checks.hermesCli?.ok ?? bridge.connected, checks.hermesCli?.detail)}
        ${diagnostic("Gateway", checks.gateway?.ok ?? bridge.gatewayRunning, checks.gateway?.detail)}
        ${diagnostic("Obsidian", checks.vault?.ok, checks.vault?.detail || bridge.vaultName)}
        <div class="setup-runtime"><span>Model</span><strong>${escapeHtml(health?.model || bridge.model || "Not detected")}</strong></div>
        <div class="setup-runtime"><span>Provider</span><strong>${escapeHtml(health?.provider || bridge.provider || "Not detected")}</strong></div>
      </aside>
    </div>
    <section class="setup-notes">
      <h3>Deployment boundary</h3>
      <p>Set <code>HERMES_VAULT_PATH</code> and <code>HERMES_CLI_PATH</code> before starting the bridge. For a hosted Vercel URL, also set <code>HERMES_MANAGER_ALLOWED_ORIGINS</code> to that exact origin and use a pairing token.</p>
    </section>
  `;

  const form = root.querySelector("[data-connection-form]");
  const values = () => Object.fromEntries(new FormData(form).entries());
  form?.addEventListener("submit", (event) => { event.preventDefault(); onSave?.(values()); });
  root.querySelector("[data-test-connection]")?.addEventListener("click", () => onTest?.(values()));
  root.querySelector("[data-reset-connection]")?.addEventListener("click", () => onReset?.());
}

function diagnostic(name, ok, detail = "Not checked yet.") {
  const state = ok === true ? "is-ok" : ok === false ? "is-error" : "";
  return `<div class="setup-check ${state}"><span class="setup-check-dot" aria-hidden="true"></span><div><strong>${escapeHtml(name)}</strong><p>${escapeHtml(detail || "Not checked yet.")}</p></div></div>`;
}

function statusLabel(status) {
  if (status === "connected") return "Bridge reachable";
  if (status === "testing") return "Testing";
  if (status === "failed") return "Connection failed";
  return "Not tested";
}

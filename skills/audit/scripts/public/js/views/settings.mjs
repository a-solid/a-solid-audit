// skills/audit/scripts/public/js/views/settings.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml } from "../app.mjs";

export async function renderSettings(container) {
  setBreadcrumb([{ label: "Settings" }]);

  let settings = {};
  try { settings = await api.getSettings(); } catch (e) { showToast("Failed to load settings"); }

  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl">Settings</h1>
        <p class="text-sm text-muted mt-1">Configure API keys, credentials, and integrations</p>
      </div>
    </div>

    <div class="card mb-4">
      <h2 class="font-semibold mb-4">${icon("zap", 16)} Anthropic</h2>
      <div class="space-y-3">
        <div>
          <label for="anthropic-key">API Key</label>
          <input id="anthropic-key" type="password" class="mt-1" placeholder="sk-ant-..."
            value="${settings.anthropic?.configured ? "••••••••••••••••" : ""}">
          ${settings.anthropic?.configured
            ? '<span class="text-xs text-success mt-1 block">已配置</span>'
            : '<span class="text-xs text-muted mt-1 block">未配置</span>'}
        </div>
      </div>
    </div>

    <div class="card mb-4">
      <h2 class="font-semibold mb-4">JIRA</h2>
      <div class="grid grid-cols-3 gap-4">
        <div>
          <label for="jira-url">Base URL</label>
          <input id="jira-url" class="mt-1" placeholder="https://your-domain.atlassian.net">
        </div>
        <div>
          <label for="jira-email">Email</label>
          <input id="jira-email" class="mt-1" placeholder="user@example.com">
        </div>
        <div>
          <label for="jira-token">API Token</label>
          <input id="jira-token" type="password" class="mt-1" placeholder="Token"
            value="${settings.jira?.configured ? "••••••••••••••••" : ""}">
          ${settings.jira?.configured
            ? '<span class="text-xs text-success mt-1 block">已配置</span>'
            : '<span class="text-xs text-muted mt-1 block">未配置</span>'}
        </div>
      </div>
    </div>

    <div class="card mb-4">
      <h2 class="font-semibold mb-4">Database</h2>
      <div class="grid grid-cols-5 gap-4">
        <div>
          <label for="db-host">Host</label>
          <input id="db-host" class="mt-1" placeholder="localhost">
        </div>
        <div>
          <label for="db-port">Port</label>
          <input id="db-port" type="number" class="mt-1" placeholder="5432">
        </div>
        <div>
          <label for="db-name">Database</label>
          <input id="db-name" class="mt-1" placeholder="mydb">
        </div>
        <div>
          <label for="db-user">User</label>
          <input id="db-user" class="mt-1" placeholder="user">
        </div>
        <div>
          <label for="db-password">Password</label>
          <input id="db-password" type="password" class="mt-1" placeholder="Password"
            value="${settings.database?.configured ? "••••••••••••••••" : ""}">
          ${settings.database?.configured
            ? '<span class="text-xs text-success mt-1 block">已配置</span>'
            : '<span class="text-xs text-muted mt-1 block">未配置</span>'}
        </div>
      </div>
    </div>

    <div class="card mb-4">
      <h2 class="font-semibold mb-4">CodeGraph</h2>
      <div>
        <label for="cg-path">Binary Path</label>
        <input id="cg-path" class="mt-1" value="${escapeHtml(settings.codegraph?.path || "~/.local/bin/codegraph")}">
      </div>
    </div>

    <div class="card mb-4">
      <h2 class="font-semibold mb-4">Custom Variables</h2>
      <div id="custom-vars-list" class="space-y-2"></div>
      <button id="add-var-btn" class="btn btn-sm mt-3">${icon("plus", 14)} Add Variable</button>
    </div>

    <div class="flex justify-between">
      <a href="#/home" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</a>
      <button id="save-settings-btn" class="btn btn-primary">${icon("check", 14)} Save Settings</button>
    </div>`;

  // Render custom vars
  const varsList = document.getElementById("custom-vars-list");
  const customVars = settings.customVars || [];
  if (customVars.length === 0) {
    addVarRow(varsList, "", "");
  } else {
    customVars.forEach(v => addVarRow(varsList, v.key, v.configured ? "••••••••" : ""));
  }

  document.getElementById("add-var-btn").addEventListener("click", () => {
    addVarRow(varsList, "", "");
  });

  function addVarRow(container, key, value) {
    const row = document.createElement("div");
    row.className = "flex gap-2";
    row.innerHTML = `
      <input class="custom-var-key" placeholder="KEY" value="${escapeHtml(key)}" style="flex:1">
      <input class="custom-var-value" type="password" placeholder="Value" value="${escapeHtml(value)}" style="flex:2">
      <button class="btn btn-ghost btn-sm remove-var-btn" aria-label="Remove">${icon("x", 14)}</button>`;
    row.querySelector(".remove-var-btn").addEventListener("click", () => row.remove());
    container.appendChild(row);
  }

  // Save
  document.getElementById("save-settings-btn").addEventListener("click", async () => {
    const btn = document.getElementById("save-settings-btn");
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...';

    const anthropicKey = document.getElementById("anthropic-key").value;
    const jiraToken = document.getElementById("jira-token").value;
    const dbPassword = document.getElementById("db-password").value;

    const payload = {};

    if (anthropicKey && !anthropicKey.startsWith("••")) {
      payload.anthropic = { apiKey: anthropicKey };
    }

    const jiraUrl = document.getElementById("jira-url").value;
    const jiraEmail = document.getElementById("jira-email").value;
    if (jiraUrl || jiraEmail || (jiraToken && !jiraToken.startsWith("••"))) {
      payload.jira = { baseUrl: jiraUrl, email: jiraEmail, token: jiraToken && !jiraToken.startsWith("••") ? jiraToken : undefined };
    }

    const dbHost = document.getElementById("db-host").value;
    const dbPort = parseInt(document.getElementById("db-port").value, 10) || 5432;
    const dbName = document.getElementById("db-name").value;
    const dbUser = document.getElementById("db-user").value;
    if (dbHost || dbName || dbUser || (dbPassword && !dbPassword.startsWith("••"))) {
      payload.database = {
        host: dbHost, port: dbPort, name: dbName, user: dbUser,
        password: dbPassword && !dbPassword.startsWith("••") ? dbPassword : undefined,
      };
    }

    const cgPath = document.getElementById("cg-path").value;
    if (cgPath) payload.codegraph = { path: cgPath };

    const customVarRows = varsList.querySelectorAll(".flex.gap-2");
    const vars = [];
    customVarRows.forEach(row => {
      const k = row.querySelector(".custom-var-key").value.trim();
      const v = row.querySelector(".custom-var-value").value;
      if (k) vars.push({ key: k, value: v && !v.startsWith("••") ? v : undefined });
    });
    if (vars.length > 0) payload.customVars = vars;

    try {
      if (Object.keys(payload).length > 0) {
        await api.updateSettings(payload);
        showToast("Settings saved", "success");
        setTimeout(() => renderSettings(container), 500);
      } else {
        showToast("No changes to save");
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    } catch (e) {
      showToast("Failed to save: " + e.message);
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  });
}

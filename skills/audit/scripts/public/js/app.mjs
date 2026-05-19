// skills/audit/scripts/public/js/app.mjs
import { api } from "./api.mjs";
import { renderHome } from "./views/home.mjs";
import { renderWizard } from "./views/wizard.mjs";
import { renderProgress } from "./views/progress.mjs";
import { renderReview } from "./views/review.mjs";
import { renderSummary } from "./views/summary.mjs";

const container = document.getElementById("app");
const breadcrumb = document.getElementById("breadcrumb");

// Toast system
export function showToast(message, type = "error") {
  const toastContainer = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => { el.remove(); }, 5000);
}

const routes = {
  home: renderHome,
  wizard: renderWizard,
  progress: renderProgress,
  review: renderReview,
  summary: renderSummary,
};

function parseHash() {
  const hash = location.hash.slice(1) || "/home";
  const [view, ...rest] = hash.split("/").filter(Boolean);
  return { view: view || "home", params: rest };
}

async function navigate() {
  const { view, params } = parseHash();
  const render = routes[view];
  if (!render) { location.hash = "#/home"; return; }

  container.innerHTML = "";
  try {
    await render(container, params);
  } catch (e) {
    if (e.message.includes("Failed to fetch") || e.message.includes("NetworkError")) {
      showToast("Network error — check that the server is running", "error");
    } else {
      showToast(e.message, "error");
    }
  }
}

window.addEventListener("hashchange", navigate);
window.addEventListener("load", navigate);

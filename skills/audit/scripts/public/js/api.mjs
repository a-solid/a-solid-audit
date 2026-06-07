// skills/audit/scripts/public/js/api.mjs
const BASE = "";
const e = encodeURIComponent;

async function request(method, path, body) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, opts);
  const data = await res.json();
  if (!res.ok) throw new ApiError(data.error || "Request failed", data.code, res.status);
  return data;
}

class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const sessionPath = (roundName, version, suffix = "") =>
  `/api/rounds/${e(roundName)}/sessions/${e(version)}${suffix}`;

export const api = {
  // Rounds
  listRounds: () => request("GET", "/api/rounds"),
  getRound: (roundName) => request("GET", `/api/rounds/${e(roundName)}`),
  createRound: (data) => request("POST", "/api/rounds", data),
  createRoundSession: (roundName, options = {}) =>
    request("POST", `/api/rounds/${e(roundName)}/sessions`, options),
  reReview: (roundName, data = {}) =>
    request("POST", `/api/rounds/${e(roundName)}/re-review`, data),
  getRoundSummary: (roundName) =>
    request("GET", `/api/rounds/${e(roundName)}/summary`),

  // Sessions
  getSession: (roundName, version) => request("GET", sessionPath(roundName, version)),
  updateSessionStatus: (roundName, version, status) =>
    request("PUT", sessionPath(roundName, version, "/status"), { status }),
  advance: (roundName, version, body) =>
    request("POST", sessionPath(roundName, version, "/advance"), body),
  patchSession: (roundName, version, data) =>
    request("PATCH", sessionPath(roundName, version), data),

  // Scope
  setScope: (roundName, version, method, ref, excludeFiles) =>
    request("POST", sessionPath(roundName, version, "/scope"), { method, ref, excludeFiles }),

  // Stories
  getStories: (roundName, version) =>
    request("GET", sessionPath(roundName, version, "/stories")),
  createStory: (roundName, version, story) =>
    request("POST", sessionPath(roundName, version, "/stories"), story),
  updateStory: (roundName, version, name, data) =>
    request("PUT", sessionPath(roundName, version, `/stories/${e(name)}`), data),
  deleteStory: (roundName, version, name) =>
    request("DELETE", sessionPath(roundName, version, `/stories/${e(name)}`)),
  mapStories: (roundName, version, mappings) =>
    request("PUT", sessionPath(roundName, version, "/stories/map"), { mappings }),

  // Tasks
  getTasks: (roundName, version) =>
    request("GET", sessionPath(roundName, version, "/tasks")),
  getTasksSummary: (roundName, version) =>
    request("GET", sessionPath(roundName, version, "/tasks/summary")),

  // Notes
  getNotes: (roundName, version) =>
    request("GET", sessionPath(roundName, version, "/notes")),
  updateTaskNote: (roundName, version, file, data) =>
    request("POST", sessionPath(roundName, version, "/notes"), { file, ...data }),

  // Review Context
  getReviewContext: (roundName, version) =>
    request("GET", sessionPath(roundName, version, "/review-context")),
  setReviewContext: (roundName, version, context) =>
    request("PUT", sessionPath(roundName, version, "/review-context"), { context }),
  appendReviewNotes: (roundName, version, notes) =>
    request("POST", sessionPath(roundName, version, "/review-notes"), { notes }),

  // Project Scan
  startScan: (roundName, version) =>
    request("POST", sessionPath(roundName, version, "/scan")),
  getScanStatus: (roundName, version) =>
    request("GET", sessionPath(roundName, version, "/scan/status")),

  // Smart Grouping
  getGraphData: (roundName, version) =>
    request("GET", sessionPath(roundName, version, "/graph-data")),
  getGroups: (roundName, version) =>
    request("GET", sessionPath(roundName, version, "/groups")),
  updateGroups: (roundName, version, groups) =>
    request("PUT", sessionPath(roundName, version, "/groups"), { groups }),
  confirmGroups: (roundName, version) =>
    request("POST", sessionPath(roundName, version, "/groups/confirm")),

  // Git
  getCommits: () => request("GET", "/api/git/commits"),
  getBranches: () => request("GET", "/api/git/branches"),
  previewScope: (method, ref) =>
    request("POST", "/api/git/preview", { method, ref }),

  // Providers
  listProviders: () => request("GET", "/api/providers"),
  fetchFromProvider: (name, ids) =>
    request("POST", `/api/providers/${e(name)}/fetch`, { ids }),

  // Settings
  getSettings: () => request("GET", "/api/settings"),
  updateSettings: (data) => request("PUT", "/api/settings", data),

  // CodeGraph
  getCodegraphStatus: (projectDir) =>
    request("GET", `/api/codegraph/status?dir=${e(projectDir)}`),
  initCodegraph: (projectDir) =>
    request("POST", "/api/codegraph/init", { projectDir }),
};

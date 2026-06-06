// skills/audit/scripts/public/js/api.mjs
const BASE = "";

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

export const api = {
  // Sessions
  listSessions: () => request("GET", "/api/sessions"),
  getSession: (id) => request("GET", `/api/sessions/${encodeURIComponent(id)}`),
  createSession: (options = {}) =>
    request("POST", "/api/sessions", options),
  updateSessionStatus: (id, status) =>
    request("PUT", `/api/sessions/${encodeURIComponent(id)}/status`, { status }),
  advance: (id, body) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/advance`, { sessionId: id, ...body }),
  patchSession: (id, data) =>
    request("PATCH", `/api/sessions/${encodeURIComponent(id)}`, data),

  // Rounds
  listRounds: () => request("GET", "/api/rounds"),
  getRound: (id) => request("GET", `/api/rounds/${encodeURIComponent(id)}`),
  createRound: (data) => request("POST", "/api/rounds", data),
  createRoundSession: (roundId, options = {}) =>
    request("POST", `/api/rounds/${encodeURIComponent(roundId)}/sessions`, options),
  reReview: (roundId, data = {}) =>
    request("POST", `/api/rounds/${encodeURIComponent(roundId)}/re-review`, data),
  getRoundSummary: (roundId) =>
    request("GET", `/api/rounds/${encodeURIComponent(roundId)}/summary`),

  // Git
  getCommits: () => request("GET", "/api/git/commits"),
  getBranches: () => request("GET", "/api/git/branches"),

  // Scope
  previewScope: (method, ref) =>
    request("POST", "/api/git/preview", { method, ref }),

  setScope: (id, method, ref, excludeFiles) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/scope`, { method, ref, excludeFiles }),

  // Providers
  listProviders: () => request("GET", "/api/providers"),
  fetchFromProvider: (name, ids) =>
    request("POST", `/api/providers/${encodeURIComponent(name)}/fetch`, { ids }),

  // Stories
  getStories: (id) => request("GET", `/api/sessions/${encodeURIComponent(id)}/stories`),
  createStory: (id, story) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/stories`, story),
  updateStory: (id, name, data) =>
    request("PUT", `/api/sessions/${encodeURIComponent(id)}/stories/${encodeURIComponent(name)}`, data),
  deleteStory: (id, name) =>
    request("DELETE", `/api/sessions/${encodeURIComponent(id)}/stories/${encodeURIComponent(name)}`),
  mapStories: (id, mappings) =>
    request("PUT", `/api/sessions/${encodeURIComponent(id)}/stories/map`, { mappings }),

  // Tasks
  getTasks: (id) => request("GET", `/api/sessions/${encodeURIComponent(id)}/tasks`),
  getTasksSummary: (id) => request("GET", `/api/sessions/${encodeURIComponent(id)}/tasks/summary`),
  getTask: (id, file) =>
    request("GET", `/api/sessions/${encodeURIComponent(id)}/tasks?file=${encodeURIComponent(file)}`),

  // Notes
  getNotes: (id) => request("GET", `/api/sessions/${encodeURIComponent(id)}/notes`),
  updateTaskNote: (id, file, data) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/notes`, { file, ...data }),
  updateSummary: (id, data) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/summary`, data),

  // Review Context
  getReviewContext: (id) => request("GET", `/api/sessions/${encodeURIComponent(id)}/review-context`),
  setReviewContext: (id, context) =>
    request("PUT", `/api/sessions/${encodeURIComponent(id)}/review-context`, { context }),
  appendReviewNotes: (id, notes) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/review-notes`, { notes }),

  // Project Scan
  startScan: (id) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/scan`),
  getScanStatus: (id) =>
    request("GET", `/api/sessions/${encodeURIComponent(id)}/scan/status`),

  // Settings
  getSettings: () => request("GET", "/api/settings"),
  updateSettings: (data) => request("PUT", "/api/settings", data),

  // CodeGraph
  getCodegraphStatus: (projectDir) =>
    request("GET", `/api/codegraph/status?dir=${encodeURIComponent(projectDir)}`),
  initCodegraph: (projectDir) =>
    request("POST", "/api/codegraph/init", { projectDir }),

  // Smart Grouping
  getGraphData: (id) =>
    request("GET", `/api/sessions/${encodeURIComponent(id)}/graph-data`),
  getGroups: (id) =>
    request("GET", `/api/sessions/${encodeURIComponent(id)}/groups`),
  updateGroups: (id, groups) =>
    request("PUT", `/api/sessions/${encodeURIComponent(id)}/groups`, { groups }),
  confirmGroups: (id) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/groups/confirm`),
};

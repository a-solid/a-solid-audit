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
  createSession: () => request("POST", "/api/sessions"),
  updateSessionStatus: (id, status) =>
    request("PUT", `/api/sessions/${encodeURIComponent(id)}/status`, { status }),

  // Git
  getCommits: () => request("GET", "/api/git/commits"),
  getBranches: () => request("GET", "/api/git/branches"),

  // Scope
  setScope: (id, method, ref) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/scope`, { method, ref }),

  // Providers
  listProviders: () => request("GET", "/api/providers"),
  fetchFromProvider: (name, ids) =>
    request("POST", `/api/providers/${encodeURIComponent(name)}/fetch`, { ids }),

  // Stories
  getStories: (id) => request("GET", `/api/sessions/${encodeURIComponent(id)}/stories`),
  createStory: (id, story) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/stories`, story),
  deleteStory: (id, name) =>
    request("DELETE", `/api/sessions/${encodeURIComponent(id)}/stories/${encodeURIComponent(name)}`),
  mapStories: (id, mappings) =>
    request("PUT", `/api/sessions/${encodeURIComponent(id)}/stories/map`, { mappings }),

  // Tasks
  getTasks: (id) => request("GET", `/api/sessions/${encodeURIComponent(id)}/tasks`),
  getTask: (id, file) =>
    request("GET", `/api/sessions/${encodeURIComponent(id)}/tasks/${encodeURIComponent(file)}`),

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
};

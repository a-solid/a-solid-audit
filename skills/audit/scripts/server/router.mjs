// skills/audit/scripts/server/router.mjs
export function createRouter() {
  const routes = [];

  return {
    get(path, handler) {
      routes.push({ method: "GET", path, handler });
    },
    post(path, handler) {
      routes.push({ method: "POST", path, handler });
    },
    put(path, handler) {
      routes.push({ method: "PUT", path, handler });
    },
    resolve(method, pathname) {
      for (const route of routes) {
        if (route.method !== method) continue;
        const params = matchRoute(route.path, pathname);
        if (params !== null) return { handler: route.handler, params };
      }
      return null;
    },
  };
}

function matchRoute(pattern, pathname) {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");

  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

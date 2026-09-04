// URL <-> app-state syncing. Path shapes:
//   /games/:gameName/player/:ign   the game dashboard
//   /server                        server-wide stats
import { state } from "./state.js";

// Most specific first; a `:name` segment matches one path segment.
const routes = [
  ["/server", "server"],
  ["/games/:gameName/player/:playerIgn", "game"],
  ["/games/:gameName", "game"],
  ["/", "game"],
];

// Not URLPattern: it postdates the browsers listenForClicks exists to serve.
function matchRoute(template, parts) {
  const segments = template.split("/").filter(Boolean);
  if (segments.length !== parts.length) return null;

  const groups = {};
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].startsWith(":")) groups[segments[i].slice(1)] = parts[i];
    else if (segments[i] !== parts[i]) return null;
  }
  return groups;
}

/** Returns `{ view, gameName, playerIgn }`, or `{ redirect: true }` for a malformed path. */
export function parsePath(pathname = window.location.pathname) {
  const parts = pathname.split("/").filter(Boolean);

  for (const [template, view] of routes) {
    const groups = matchRoute(template, parts);
    if (groups) return { view, gameName: null, playerIgn: null, ...groups };
  }
  return { redirect: true };
}

let renderRoute = null;

/** Take over navigation with `fn` as the view renderer; called once for the current URL. */
export function startRouter(fn) {
  renderRoute = fn;

  if (window.navigation) listenForNavigations();
  else listenForClicks();

  // Neither mechanism fires for the load that got us here.
  renderRoute(parsePath());
}

// The browser reports every navigation it could handle, so nothing needs intercepting by hand.
function listenForNavigations() {
  navigation.addEventListener("navigate", (e) => {
    // Cross-origin, downloads, form posts and #fragments stay the browser's job.
    if (!e.canIntercept || e.hashChange || e.downloadRequest !== null || e.formData) return;

    // updatePath()'s replaceState fires this too, for the view already on screen.
    if (e.navigationType === "replace") return;

    e.intercept({
      handler: () => renderRoute(parsePath(new URL(e.destination.url).pathname)),
    });
  });
}

// Fallback for browsers without the Navigation API: Firefox <147, Safari <26.2.
function listenForClicks() {
  document.addEventListener("click", (e) => {
    // Leave modified clicks alone — they mean "open elsewhere", not "navigate".
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const link = e.target.closest('a[href^="/"]');
    const href = link?.getAttribute("href");
    // `//host` is protocol-relative, i.e. another origin.
    if (!href || href.startsWith("//") || link.target || link.hasAttribute("download")) return;

    e.preventDefault();
    navigate(href);
  });

  window.addEventListener("popstate", () => renderRoute(parsePath()));
}

/** Navigate to `path` without reloading. */
export function navigate(path) {
  if (path === window.location.pathname) return;

  // Comes back through the navigate listener, which does the rendering.
  if (window.navigation) {
    navigation.navigate(path);
    return;
  }

  window.history.pushState({}, "", path);
  renderRoute(parsePath(path));
}

/** Reflect the current game/player into the address bar without navigating. */
export function updatePath() {
  const { currentGame, currentPlayer } = state;
  if (!currentGame) return;

  let newPath = `/games/${currentGame.name}`;
  if (currentPlayer && currentPlayer.ign) {
    newPath += `/player/${currentPlayer.ign}`;
  }
  // Not navigation.navigate(): this runs inside the handler it would abort.
  window.history.replaceState({}, "", newPath);
  setTitle("game");
}

const SITE_NAME = "CubeCraft Tracker";

/** Name the tab after what the address bar now points at; a bookmark should read back the same. */
export function setTitle(view) {
  if (view === "server") {
    document.title = `Server - ${SITE_NAME}`;
    return;
  }

  const { currentGame, currentPlayer } = state;
  const scope = [currentPlayer?.ign, currentGame?.displayName].filter(Boolean);
  document.title = scope.length ? `${scope.join(" - ")} - ${SITE_NAME}` : SITE_NAME;
}

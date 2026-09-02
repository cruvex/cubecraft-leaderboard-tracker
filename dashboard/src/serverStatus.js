// Live status card: the newest reading and the version range, refreshed on a timer.
import { el } from "./dom.js";
import { apiFetch, endpoints } from "./api.js";

const POLL_MS = 60 * 1000;

// Samples land every 60s, so anything past this is an outage rather than jitter.
const STALE_AFTER_MS = 10 * 60 * 1000;

let timer = null;

/** Start polling and refresh now. Safe to call on every visit to the view. */
export function startServerStatus() {
  loadServerStatus();
  if (timer) return;

  timer = setInterval(tick, POLL_MS);
  document.addEventListener("visibilitychange", onVisibility);
}

export function stopServerStatus() {
  clearInterval(timer);
  timer = null;
  document.removeEventListener("visibilitychange", onVisibility);
}

// A backgrounded tab polls nothing; coming back is worth a refresh rather than a wait.
function tick() {
  if (document.visibilityState === "visible") loadServerStatus();
}

function onVisibility() {
  if (document.visibilityState === "visible") loadServerStatus();
}

export async function loadServerStatus() {
  try {
    render(await apiFetch(endpoints.serverStatus()));
  } catch (err) {
    console.error("Failed to load server status", err);
    el("statusUpdated").textContent = "Couldn't reach the tracker.";
  }
}

function render({ latest, version }) {
  const age = latest ? Date.now() - new Date(latest.timestamp).getTime() : null;
  const stale = age === null || age > STALE_AFTER_MS;

  el("statusPlayers").textContent = latest ? latest.online.toLocaleString() : "—";
  el("statusCapacity").textContent = latest?.capacity
    ? `/ ${latest.capacity.toLocaleString()}`
    : "";

  el("statusVersion").textContent = version ? formatRange(version) : "—";

  el("statusPlayers").classList.toggle("is-stale", stale);
  el("statusUpdated").textContent = !latest
    ? "No readings yet."
    : stale
      ? `Last reading ${formatAge(age)}`
      : `Updated ${formatAge(age)} · refreshes every minute`;
}

// The ping reports a range, but a server pinned to one version reports it twice.
function formatRange({ minimum, maximum }) {
  return minimum === maximum ? minimum : `${minimum} – ${maximum}`;
}

function formatAge(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

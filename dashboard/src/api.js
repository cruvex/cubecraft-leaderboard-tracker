// API client: a thin fetch wrapper plus explicit endpoint builders.
//
// Endpoints are built by dedicated functions rather than inferred from the URL
// string, so there's no fragile substring sniffing to decide game-scoping or
// the `days` param. Callers pass exactly what each route needs.

const API_BASE = "/api";

/**
 * Fetch JSON from an API path (the result of an `endpoints.*` builder) or an
 * absolute URL. Throws on non-2xx.
 */
export async function apiFetch(path) {
  const url = /^https?:\/\//.test(path) ? path : `${API_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

/** Build a query string from defined, non-empty params. */
function qs(params) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  if (!entries.length) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

export const endpoints = {
  games: () => `/games`,

  /** Sidebar top-gainers list. */
  topGainers: (gameId, days) => `/games/${gameId}/top-gainers${qs({ days })}`,

  /** Default seed for the comparison chart: top-N gainers with their histories. */
  topGainersHistory: (gameId, days, limit) =>
    `/games/${gameId}/top-gainers/history${qs({ days, limit })}`,

  /** Comparison chart for an explicit player set (UUIDs or IGNs). */
  playersHistory: (gameId, ids, days) =>
    `/games/${gameId}/players/history${qs({ ids: ids.join(","), days })}`,

  /**
   * A single player's score history. No `days` param: the backend defaults to
   * its window and the client filters to the displayed range.
   */
  playerScores: (gameId, idOrIgn) =>
    `/games/${gameId}/player/${encodeURIComponent(idOrIgn)}`,

  leaderboard: (gameId, days) => `/games/${gameId}/leaderboard${qs({ days })}`,

  /** Concurrent-player readings for one game; `bucket` is in seconds. */
  gamePopulation: (gameId, hours, bucket) =>
    `/games/${gameId}/population${qs({ hours, bucket })}`,

  /** Autocomplete search; returns { uuid, ign } pairs. */
  searchPlayers: (q) => `/search/players${qs({ q })}`,
};

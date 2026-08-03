// Persist the comparison chart's view state (timeframe, mode, selection) to
// localStorage so it survives reloads.
import { state } from "./state.js";

const KEY = "comparison-chart-state";
const ALLOWED_DAYS = [7, 30, 90, 180, 365, 730];

/** Serialize the current comparison state to localStorage. */
export function saveComparisonState() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        days: state.comparisonDays,
        mode: state.comparisonMode,
        // null = default (top gainers), [] = cleared, [..] = custom selection
        // of { uuid, ign } pairs.
        players: state.comparisonPlayers,
      })
    );
  } catch {
    // Ignore quota/availability errors — persistence is best-effort.
  }
}

/** Restore comparison state from localStorage into `state` (call before first load). */
export function loadComparisonState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);

    if (ALLOWED_DAYS.includes(saved.days)) state.comparisonDays = saved.days;
    if (saved.mode === "total" || saved.mode === "gained") state.comparisonMode = saved.mode;
    // Selections are { uuid, ign } pairs; the chart always queries by UUID.
    // Legacy saves (bare IGN strings) are discarded and fall back to default.
    if (
      saved.players === null ||
      (Array.isArray(saved.players) &&
        saved.players.every(
          (p) => p && typeof p.uuid === "string" && typeof p.ign === "string"
        ))
    ) {
      state.comparisonPlayers = saved.players;
    }
  } catch {
    // Corrupt/unparseable value — fall back to defaults.
  }
}

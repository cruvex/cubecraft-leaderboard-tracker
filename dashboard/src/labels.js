// Text labels that depend on the current game's score type / display mode.
import { el } from "./dom.js";
import { state } from "./state.js";

/** Sync all score-type-dependent labels (".leaderboardScoreType", etc.). */
export function updateScoreTypeLabels() {
  const scoreType = state.currentGame?.scoreType || "Wins";

  document.querySelectorAll(".leaderboardScoreType").forEach((e) => {
    e.textContent = scoreType;
  });
  document.querySelectorAll(".gainTypeLabel").forEach((e) => {
    e.textContent = state.displayMode === "wins" ? scoreType : "Positions";
  });
  document.querySelectorAll(".currentTypeLabel").forEach((e) => {
    e.textContent = state.displayMode === "wins" ? `Total ${scoreType}` : "Position";
  });
}

/** Update the leaderboard card's descriptive copy for the current timeframe. */
export function updateLeaderboardDescription() {
  const rangeEl = el("leaderboardTimeRange");
  const summaryTextEl = el("leaderboardSummaryText");

  updateScoreTypeLabels();

  if (!rangeEl) return;

  const timeText = state.currentDays === 7 ? "last 7 days" : "last month";
  rangeEl.textContent = `All changes are relative to the ${timeText}.`;

  if (summaryTextEl) {
    summaryTextEl.textContent = `The summary below lists players who entered or left the leaderboard in the ${timeText}.`;
  }
}

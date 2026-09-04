// Text labels that depend on the current game's score type / display mode.
//
// Markup opts in with data-label="<key>"; nothing else knows these keys exist.
// Adding a label is one attribute in the HTML, not a new class plus a new sweep.
import { el } from "./dom.js";
import { state, subscribe } from "./state.js";

const LABELS = {
  scoreType: () => state.currentGame?.scoreType || "Wins",
  gameName: () => state.currentGame?.displayName || "This game",
  gainType: () => (state.displayMode === "wins" ? LABELS.scoreType() : "Positions"),
  currentType: () => (state.displayMode === "wins" ? `Total ${LABELS.scoreType()}` : "Position"),
};

/**
 * Fill every [data-label] under `root`. Pass the node you just built to scope
 * the work to it; the default sweeps the document, which is only what a state
 * change needs.
 */
export function renderLabels(root = document) {
  for (const node of root.querySelectorAll("[data-label]")) {
    const value = LABELS[node.dataset.label];
    if (value) node.textContent = value();
  }
}

// State changes re-render every label.
subscribe(["game", "displayMode"], () => renderLabels());

/** Set the player count in the leaderboard card's copy from the rows actually returned. */
export function setLeaderboardRowCount(count) {
  const countEl = el("leaderboardRowCount");
  if (countEl) countEl.textContent = count.toLocaleString();
}

/** Update the leaderboard card's descriptive copy for the current timeframe. */
export function updateLeaderboardDescription() {
  const rangeEl = el("leaderboardTimeRange");
  const summaryTextEl = el("leaderboardSummaryText");

  renderLabels();

  if (!rangeEl) return;

  const timeText = state.currentDays === 7 ? "last 7 days" : "last month";
  rangeEl.textContent = `All changes are relative to the ${timeText}.`;

  if (summaryTextEl) {
    summaryTextEl.textContent = `The summary below lists players who entered or left the leaderboard in the ${timeText}.`;
  }
}

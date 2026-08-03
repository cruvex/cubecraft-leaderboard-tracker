// Player profile panel: search/select a player, fetch their scores, render
// stats + the score-over-time chart.
import { el, formatUuid } from "./dom.js";
import { state } from "./state.js";
import { apiFetch, endpoints } from "./api.js";
import { updatePath } from "./router.js";
import { updateScoreTypeLabels } from "./labels.js";
import { renderPlayerChart, destroyPlayerChart } from "./charts/playerChart.js";
import { addToComparison, isInComparison } from "./comparisonSelection.js";

/**
 * Reflect whether the displayed player is already on the comparison chart.
 * @param {{ uuid: string, ign: string }} player
 */
function syncAddToComparisonBtn(player) {
  const btn = el("addToComparisonBtn");
  if (!btn) return;
  const added = isInComparison(player.ign);
  btn.textContent = added ? "✓ In comparison" : "+ Add to comparison";
  btn.classList.toggle("added", added);
  btn.onclick = () => {
    addToComparison(player);
    syncAddToComparisonBtn(player);
  };
}

// Keep the profile button in sync when the comparison changes elsewhere
// (e.g. reset/clear, or removing the player via a chip).
document.addEventListener("comparison:rendered", () => {
  const cp = state.currentPlayer;
  if (cp?.ign && el("playerProfile").style.display !== "none") {
    syncAddToComparisonBtn({ uuid: cp.id, ign: cp.ign });
  }
});

export function scrollToPlayerProfile() {
  if (window.innerWidth <= 900) {
    document.querySelector("main").scrollIntoView({ behavior: "smooth" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

export async function loadPlayerProfile(idOrIgn, forceFetch = false) {
  if (!idOrIgn) return;

  const scoreType = state.currentGame?.scoreType || "Wins";
  const cp = state.currentPlayer;

  if (!forceFetch && cp && (cp.id === idOrIgn || cp.ign === idOrIgn) && cp.data) {
    renderPlayerProfile(cp.data, scoreType);
    return;
  }

  el("emptyState").style.display = "none";
  el("errorState").style.display = "none";
  el("playerProfile").style.display = "block";
  el("chartLoading").style.display = "flex";

  el("displayIgn").innerText = "Loading...";
  el("displayUuid").innerText = idOrIgn;
  el("displayGain7d").innerText = "---";
  el("displayGain30d").innerText = "---";
  el("displayCurrentScore").innerText = "---";

  try {
    const scoreData = await apiFetch(endpoints.playerScores(state.currentGame.id, idOrIgn));
    state.currentPlayer = { id: scoreData.player, ign: scoreData.ign, data: scoreData };

    updatePath();
    renderPlayerProfile(scoreData, scoreType);
  } catch (err) {
    console.error(err);
    el("playerProfile").style.display = "none";
    el("errorState").style.display = "block";
    el("errorTitle").innerText = "Player Not Found";
    el("errorMessage").innerText = `Player '${idOrIgn}' is not on the ${
      state.currentGame?.displayName || "selected game"
    } leaderboard.`;
  } finally {
    el("chartLoading").style.display = "none";
  }
}

export function renderPlayerProfile(scoreData, scoreType) {
  el("emptyState").style.display = "none";
  el("errorState").style.display = "none";
  el("playerProfile").style.display = "block";

  el("displayIgn").innerText = scoreData.ign;
  el("displayUuid").innerText = formatUuid(scoreData.player);
  syncAddToComparisonBtn({ uuid: scoreData.player, ign: scoreData.ign });

  const setGainEl = (id, value, showPlus) => {
    const elem = el(id);
    elem.innerText = (showPlus && value > 0 ? "+" : "") + value.toLocaleString();
    elem.classList.remove("text-positive", "text-negative");
    if (value > 0) elem.classList.add("text-positive");
    else if (value < 0) elem.classList.add("text-negative");
  };

  if (scoreData.rows?.length) {
    if (state.displayMode === "wins") {
      setGainEl("displayGain7d", scoreData.gain7d, true);
      setGainEl("displayGain30d", scoreData.gain30d, true);
      const currentScore = scoreData.rows[scoreData.rows.length - 1].score;
      el("displayCurrentScore").innerText = currentScore.toLocaleString();
    } else {
      // Position gains
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const rows = scoreData.rows;
      const currentPos = rows[rows.length - 1].position;

      const getGain = (days) => {
        const targetTime = now - days * dayMs;
        const oldRow = rows.find((r) => new Date(r.timestamp).getTime() >= targetTime);
        if (!oldRow) return 0;
        return oldRow.position - currentPos; // old 10, current 5 -> +5
      };

      setGainEl("displayGain7d", getGain(7), true);
      setGainEl("displayGain30d", getGain(30), true);
      el("displayCurrentScore").innerText = "#" + currentPos.toLocaleString();
    }

    renderPlayerChart(scoreData.rows, scoreType);
    updateScoreTypeLabels();
  } else {
    el("displayGain7d").innerText = "0";
    el("displayGain30d").innerText = "0";
    el("displayCurrentScore").innerText = "No data";
    destroyPlayerChart();
  }
}

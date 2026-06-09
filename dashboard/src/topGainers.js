// Sidebar "Top Gainers" table.
import { el } from "./dom.js";
import { state } from "./state.js";
import { apiFetch, endpoints } from "./api.js";
import { updateScoreTypeLabels } from "./labels.js";
import { loadPlayerProfile, scrollToPlayerProfile } from "./playerProfile.js";
import { addToComparison, isInComparison } from "./comparisonSelection.js";

/** Reflect comparison membership on a hover-revealed add button. */
function setAddedState(btn, added) {
  btn.classList.toggle("added", added);
  btn.textContent = added ? "✓" : "+";
  btn.title = added ? "In comparison chart" : "Add to comparison chart";
}

/** Re-sync every add button to current comparison membership. */
function syncTopGainersButtons() {
  document.querySelectorAll("#topGainers .add-to-comparison-btn").forEach((btn) => {
    setAddedState(btn, isInComparison(btn.dataset.ign));
  });
}

// Keep the buttons in sync whenever the comparison changes (add/remove/reset).
document.addEventListener("comparison:rendered", syncTopGainersButtons);

export async function loadTopGainers() {
  const container = el("topGainers");
  container.innerHTML =
    '<div class="text-muted centered-p" style="padding: 1.5rem;">Loading...</div>';

  try {
    const topGainers = await apiFetch(
      endpoints.topGainers(state.currentGame.id, state.currentDays)
    );
    renderTopGainers(topGainers);
  } catch (err) {
    container.innerHTML =
      '<div class="text-muted centered-p error-text" style="padding: 1.5rem;">Failed to load data</div>';
  }
}

function renderTopGainers(data) {
  const container = el("topGainers");

  if (!data?.length) {
    container.innerHTML =
      '<div class="text-muted centered-p" style="padding: 2rem;">No data available</div>';
    return;
  }

  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th class="text-center">#</th>
        <th class="text-center">Player</th>
        <th class="text-center leaderboardScoreType">Wins</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  let i = 0;
  data.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    // The rank cell doubles as the add-to-comparison control: the number shows
    // by default and is replaced by a "+" on row hover.
    tr.innerHTML = `
      <td class="tg-rank text-center">
        <span class="rank-number">${i + 1}.</span>
        <button type="button" class="add-to-comparison-btn"
          title="Add to comparison chart"
          aria-label="Add ${row.ign} to comparison chart">+</button>
      </td>
      <td>
        <div class="player-ign-cell">${row.ign}</div>
      </td>
      <td class="text-center">
        <span class="badge">+${row.score_gain.toLocaleString()}</span>
      </td>
    `;

    const addBtn = tr.querySelector(".add-to-comparison-btn");
    addBtn.dataset.ign = row.ign;
    setAddedState(addBtn, isInComparison(row.ign));
    addBtn.onclick = (e) => {
      e.stopPropagation(); // don't open the player profile
      addToComparison(row.ign);
      setAddedState(addBtn, true); // snappy; the render event re-syncs all rows
    };

    tr.onclick = () => {
      if (state.currentPlayer && state.currentPlayer.id === row.player) return;
      loadPlayerProfile(row.player);
      scrollToPlayerProfile();
    };
    tbody.appendChild(tr);
    i++;
  });
  container.innerHTML = "";
  container.appendChild(table);
  updateScoreTypeLabels();
}

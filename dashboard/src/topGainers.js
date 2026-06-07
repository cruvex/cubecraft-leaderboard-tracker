// Sidebar "Top Gainers" table.
import { el } from "./dom.js";
import { state } from "./state.js";
import { apiFetch, endpoints } from "./api.js";
import { updateScoreTypeLabels } from "./labels.js";
import { loadPlayerProfile, scrollToPlayerProfile } from "./playerProfile.js";

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
    tr.innerHTML = `
      <td>
      ${i + 1}.
      </td>
      <td>
        <div class="player-ign-cell">${row.ign}</div>
      </td>
      <td class="text-center">
        <span class="badge">+${row.score_gain.toLocaleString()}</span>
      </td>
    `;
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

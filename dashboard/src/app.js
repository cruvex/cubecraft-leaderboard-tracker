// Entry point: bootstraps the dashboard and wires up the top-level controls.
// Feature logic lives in the imported modules.
import { state, enabledGames } from "./state.js";
import { el } from "./dom.js";
import { apiFetch, endpoints } from "./api.js";
import { parseInitialPath, updatePath } from "./router.js";
import { updateLeaderboardDescription } from "./labels.js";
import { loadTopGainers } from "./topGainers.js";
import { loadPlayerProfile } from "./playerProfile.js";
import { renderPlayerChart, updatePlayerChartTheme } from "./charts/playerChart.js";
import { loadLeaderboard, updateLeaderboardChartTheme } from "./charts/leaderboardChart.js";
import { setupSearch } from "./search.js";

async function init() {
  const { gameName: initialGameName, playerIgn: initialPlayerIgn, redirect } = parseInitialPath();
  if (redirect) {
    window.location.href = "/";
    return;
  }

  try {
    const activeBtn = el("daysToggle").querySelector(".toggle-btn.active");
    if (activeBtn) {
      state.currentDays = Number(activeBtn.dataset.days);
    }

    const fetchedGames = await apiFetch(endpoints.games());
    state.games = fetchedGames.filter((g) => g.shouldTrack);

    // Default to Team Eggwars if no game found in path
    if (!initialGameName) {
      state.currentGame = state.games.find((g) => g.name === "team_eggwars") || state.games[0];
    } else {
      const game = state.games.find((g) => g.name === initialGameName);
      if (!game) {
        window.location.href = "/";
        return;
      }
      state.currentGame = game;
    }

    const selector = el("gameSelector");
    state.games.forEach((game) => {
      if (!enabledGames.includes(game.name)) return;
      const opt = document.createElement("option");
      opt.value = game.id;
      opt.textContent = game.displayName;
      opt.selected = game.id === state.currentGame?.id;
      selector.appendChild(opt);
    });

    selector.onchange = (e) => {
      const gameId = Number(e.target.value);
      state.currentGame = state.games.find((g) => g.id === gameId) || null;
      if (state.currentPlayer) state.currentPlayer.data = null;
      updateLeaderboardDescription();
      updatePath();
      loadTopGainers();
      loadLeaderboard();
      if (state.currentPlayer) {
        loadPlayerProfile(state.currentPlayer.ign, true);
      }
    };

    el("daysToggle").onclick = (e) => {
      const btn = e.target.closest(".toggle-btn");
      if (!btn) return;
      if (state.currentDays === Number(btn.dataset.days)) return;

      state.currentDays = Number(btn.dataset.days);

      el("daysToggle").querySelectorAll(".toggle-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      updateLeaderboardDescription();

      loadTopGainers();
      loadLeaderboard();
      if (state.currentPlayer && state.currentPlayer.data) {
        const scoreType = state.currentGame?.scoreType || "Wins";
        renderPlayerChart(state.currentPlayer.data.rows, scoreType);
      }
    };

    updateLeaderboardDescription();

    await Promise.all([
      loadTopGainers(),
      loadLeaderboard(),
      initialPlayerIgn ? loadPlayerProfile(initialPlayerIgn) : Promise.resolve(),
    ]);
    if (!initialPlayerIgn) {
      updatePath();
    }
  } catch (err) {
    console.error("Initialization failed", err);
  }

  setupSearch();

  el("displayModeToggle").onclick = (e) => {
    const btn = e.target.closest(".toggle-btn");
    if (!btn || btn.classList.contains("active")) return;

    el("displayModeToggle")
      .querySelectorAll(".toggle-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.displayMode = btn.dataset.mode;

    if (state.currentPlayer && state.currentPlayer.data) {
      loadPlayerProfile(state.currentPlayer.ign);
    }
  };

  // Re-theme all charts when the light/dark theme attribute changes.
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === "theme") {
        updatePlayerChartTheme();
        updateLeaderboardChartTheme();
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true });
}

init();

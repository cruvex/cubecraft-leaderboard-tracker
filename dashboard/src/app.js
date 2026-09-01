// Entry point: bootstraps the dashboard and wires up the top-level controls.
// Feature logic lives in the imported modules.
import { state, enabledGames, notify } from "./state.js";
import { el } from "./dom.js";
import { apiFetch, endpoints } from "./api.js";
import { parseInitialPath, updatePath } from "./router.js";
import { updateLeaderboardDescription } from "./labels.js";
import { loadPlayerProfile } from "./playerProfile.js";
import { updatePlayerChartTheme } from "./charts/playerChart.js";
import { updateLeaderboardChartTheme } from "./charts/leaderboardChart.js";
import { updatePopulationChartTheme } from "./charts/populationChart.js";
import {
  loadComparisonChart,
  renderComparisonChart,
  updateComparisonChartTheme,
} from "./charts/comparisonChart.js";
import { setupSearch } from "./search.js";
import { setupComparisonSelection } from "./comparisonSelection.js";
import { loadComparisonState, saveComparisonState } from "./comparisonStore.js";

// Side-effect imports: they register themselves and export nothing, so they look
// removable. Dropping them drops the modules from the bundle entirely.
import "./topGainers.js";
import "./elements/theme-toggle.js";

async function init() {
  const { gameName: initialGameName, playerIgn: initialPlayerIgn, redirect } = parseInitialPath();
  if (redirect) {
    window.location.href = "/";
    return;
  }

  // Restore the persisted comparison view before any chart loads.
  loadComparisonState();

  try {
    const activeBtn = el("daysToggle").querySelector(".toggle-btn.active");
    if (activeBtn) {
      state.currentDays = Number(activeBtn.dataset.days);
    }

    const fetchedGames = await apiFetch(endpoints.games());
    state.games = fetchedGames.filter((g) => g.active);

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
      notify("game");
    };

    // The population chart keeps its own timeframe: its readings are minutes
    // apart, so it wants a 24h view the global 7D/30D toggle cannot express.
    el("populationRangeToggle").onclick = (e) => {
      const btn = e.target.closest(".toggle-btn");
      if (!btn || btn.classList.contains("active")) return;

      el("populationRangeToggle")
        .querySelectorAll(".toggle-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.populationHours = Number(btn.dataset.hours);

      notify("populationHours");
    };

    el("daysToggle").onclick = (e) => {
      const btn = e.target.closest(".toggle-btn");
      if (!btn) return;
      if (state.currentDays === Number(btn.dataset.days)) return;

      state.currentDays = Number(btn.dataset.days);

      el("daysToggle").querySelectorAll(".toggle-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      updateLeaderboardDescription();

      notify("days");
    };

    // Comparison chart controls (independent timeframe + total/gained mode).
    // Sync the controls to the restored state first.
    el("comparisonTimeframe").value = String(state.comparisonDays);
    el("comparisonModeToggle")
      .querySelectorAll(".toggle-btn")
      .forEach((b) => b.classList.toggle("active", b.dataset.mode === state.comparisonMode));

    el("comparisonTimeframe").onchange = (e) => {
      state.comparisonDays = Number(e.target.value);
      saveComparisonState();
      loadComparisonChart(state.comparisonPlayers);
    };

    el("comparisonModeToggle").onclick = (e) => {
      const btn = e.target.closest(".toggle-btn");
      if (!btn || btn.classList.contains("active")) return;
      el("comparisonModeToggle")
        .querySelectorAll(".toggle-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.comparisonMode = btn.dataset.mode;
      saveComparisonState();
      // Pure re-render of cached data, no refetch needed.
      renderComparisonChart(state.comparisonData);
    };

    updateLeaderboardDescription();

    // Same fan-out as a game change, so the initial load never drifts from it.
    await Promise.all([
      notify("game"),
      initialPlayerIgn ? loadPlayerProfile(initialPlayerIgn) : Promise.resolve(),
    ]);
    if (!initialPlayerIgn) {
      updatePath();
    }
  } catch (err) {
    console.error("Initialization failed", err);
  }

  setupSearch();
  setupComparisonSelection();

  el("displayModeToggle").onclick = (e) => {
    const btn = e.target.closest(".toggle-btn");
    if (!btn || btn.classList.contains("active")) return;

    el("displayModeToggle")
      .querySelectorAll(".toggle-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.displayMode = btn.dataset.mode;
    notify("displayMode");

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
        updateComparisonChartTheme();
        updatePopulationChartTheme();
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true });
}

init();

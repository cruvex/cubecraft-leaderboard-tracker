// Entry point: bootstraps the dashboard and wires the top-level controls; feature logic lives in the imports.
import { state, enabledGames, notify } from "./state.js";
import { Chart } from "./charts/register.js";
import { el } from "./dom.js";
import { apiFetch, endpoints } from "./api.js";
import { startRouter, updatePath } from "./router.js";
import { updateLeaderboardDescription } from "./labels.js";
import { loadPlayerProfile } from "./playerProfile.js";
import { updatePlayerChartTheme } from "./charts/playerChart.js";
import { updateLeaderboardChartTheme } from "./charts/leaderboardChart.js";
import { updatePopulationChartTheme } from "./charts/populationChart.js";
import {
  loadServerPopulation,
  updateServerPopulationChartTheme,
} from "./charts/serverPopulationChart.js";
import {
  loadComparisonChart,
  renderComparisonChart,
  updateComparisonChartTheme,
} from "./charts/comparisonChart.js";
import { setupSearch } from "./search.js";
import { setupComparisonSelection } from "./comparisonSelection.js";
import { loadComparisonState, saveComparisonState } from "./comparisonStore.js";

// Side-effect imports: they export nothing and look removable, but dropping them drops the modules.
import "./topGainers.js";
import "./elements/theme-toggle.js";

// Each view is set up on first show and then left alone; switching back restores rather than rebuilds.
let gameViewReady = false;
let serverViewReady = false;

async function renderRoute(route) {
  if (route.redirect) {
    window.location.href = "/";
    return;
  }
  if (route.view === "server") showServerView();
  else await showGameView(route);
}

function setNavLink(href, text) {
  const navLink = el("navLink");
  navLink.setAttribute("href", href);
  navLink.textContent = text;
}

/** A canvas hidden during a window resize never got the callback, so it draws stale until nudged. */
function resizeCharts(container) {
  container.querySelectorAll("canvas").forEach((canvas) => Chart.getChart(canvas)?.resize());
}

// /server shares the shell but no game state, so the selector is hidden rather than left showing a game.
function showServerView() {
  el("gameView").hidden = true;
  el("serverView").hidden = false;
  el("gameSelector").hidden = true;
  setNavLink("/", "Dashboard");

  if (!serverViewReady) {
    serverViewReady = true;
    el("serverRangeToggle").onclick = (e) => {
      const btn = e.target.closest(".toggle-btn");
      if (!btn || btn.classList.contains("active")) return;

      el("serverRangeToggle")
        .querySelectorAll(".toggle-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.serverHours = Number(btn.dataset.hours);

      notify("serverHours");
    };
  }

  resizeCharts(el("serverView"));

  // Refetched on every visit: a minute-resolution series goes stale fast.
  loadServerPopulation();
}

async function showGameView(route) {
  el("serverView").hidden = true;
  el("gameView").hidden = false;
  el("gameSelector").hidden = false;
  setNavLink("/server", "Network");

  if (!gameViewReady) {
    gameViewReady = true;
    await bootstrapGameView(route);
    return;
  }

  resizeCharts(el("gameView"));

  // Returning from /server: charts and state survived, so only the address bar needs putting back.
  updatePath();
  if (route.playerIgn) loadPlayerProfile(route.playerIgn);
}

async function bootstrapGameView({ gameName: initialGameName, playerIgn: initialPlayerIgn }) {
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

    // Its own timeframe: minute-apart readings want a 24h view the global 7D/30D toggle cannot express.
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

    // Comparison controls (independent timeframe + total/gained), synced to the restored state first.
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

}

function init() {
  // Re-theme every chart on theme change; each updater no-ops when its chart does not exist.
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === "theme") {
        updatePlayerChartTheme();
        updateLeaderboardChartTheme();
        updateComparisonChartTheme();
        updatePopulationChartTheme();
        updateServerPopulationChartTheme();
      }
    });
  }).observe(document.documentElement, { attributes: true });

  startRouter(renderRoute);
}

init();

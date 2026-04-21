import {
  Chart,
  LineController,
  LineElement,
  LinearScale,
  BarController,
  BarElement,
  CategoryScale,
  PointElement,
  Tooltip
} from "chart.js";

Chart.register(
    LineController,
    LineElement,
    LinearScale,
    BarController,
    BarElement,
    CategoryScale,
    PointElement,
    Tooltip
);

const apiBase = "/api";
let chart = null;
let leaderboardChart = null;
let games = [];
let currentGameId = 11;
let currentDays = 30;
/** @type {{ id: string, data: Object[] } | undefined} */
let currentPlayer = undefined;
const enabledGames = ["team_eggwars", "solo_skywars"];

const TRACKING_START_DATES = {
  solo_skywars: "April 2nd, 2026",
  team_eggwars: "March 19th, 2026",
};

const el = (id) => document.getElementById(id);

async function apiFetch(endpoint) {
  const isInternal = endpoint.startsWith("/");
  let url = endpoint;
  
  if (isInternal && currentGameId) {
    if (url.startsWith("/top-gainers") || url.startsWith("/leaderboard")) {
      url = `/games/${currentGameId}${url}`;
    } else if (url.startsWith("/player/")) {
      const parts = url.split("/");
      // parts[0] is "", parts[1] is "player", parts[2] is ":id", parts[3] is "scores"
      url = `/games/${currentGameId}/player/${parts[2]}`;
    }

    if (url !== "/games" && !url.includes("leaderboard") && !url.includes("?days=") && !url.includes("player")) {
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}days=${currentDays}`;
    }
  }

  const res = await fetch(isInternal ? `${apiBase}${url}` : url);
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

function formatUuid(uuid) {
  if (!uuid) return "";
  if (uuid.length === 32)
    return uuid.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
  return uuid;
}

function renderTopGainers(data) {
  const container = el("topGainers");
  
  if (!data?.length) {
    container.innerHTML = '<div class="text-muted centered-p" style="padding: 2rem;">No data available</div>';
    return;
  }

  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th class="text-center">#</th>
        <th class="text-center">Player</th>
        <th class="text-center">Wins</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  
  const tbody = table.querySelector("tbody");
  let i = 0;
  data.forEach(row => {
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
      if (currentPlayer && currentPlayer.id === row.player) return;
      loadPlayerProfile(row.player);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    tbody.appendChild(tr);
    i++;
  });

  container.innerHTML = "";
  container.appendChild(table);
}

function getStyle(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderChart(rows, ign, scoreType = "Score") {
  const ctx = el("scoreChart").getContext("2d");
  
  const now = Date.now();
  const maxTime = now;
  const minTime = now - (currentDays * 24 * 60 * 60 * 1000);

  const chartData = rows
    .map(r => ({
      x: new Date(r.timestamp).getTime(),
      y: r.score
    }))
    .filter(d => d.x >= minTime);

  if (chart) chart.destroy();

  if (!chartData.length) {
    return;
  }

  const minVal = Math.min(...chartData.map(d => d.y));
  const maxVal = Math.max(...chartData.map(d => d.y));
  const padding = maxVal === minVal ? 1 : Math.max(1, Math.ceil((maxVal - minVal) * 0.1));

  const primary = getStyle('--primary');
  const textMuted = getStyle('--text-muted');
  const border = getStyle('--border');
  const text = getStyle('--text');
  const cardBg = getStyle('--card-bg');

  chart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [{
        label: `${scoreType}`,
        data: chartData,
        borderColor: primary,
        backgroundColor: `${primary}1a`,
        tension: 0,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: primary,
        clip: false,
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          left: 5,
          right: 5
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cardBg,
          titleColor: text,
          bodyColor: text,
          borderColor: border,
          borderWidth: 1,
          padding: 12,
          boxPadding: 4,
          usePointStyle: true,
          mode: 'index',
          intersect: false,
          callbacks: {
            title: (tooltipItems) => {
              const date = new Date(tooltipItems[0].parsed.x);
              return date.toLocaleString();
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: minTime,
          max: maxTime,
          grid: { display: false },
          ticks: { 
            maxRotation: 0, 
            autoSkip: true, 
            stepSize: 24 * 60 * 60 * 1000,
            color: textMuted,
            callback: (val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          }
        },
        y: {
          beginAtZero: false,
          suggestedMin: minVal - padding,
          suggestedMax: maxVal + padding,
          grid: {
            color: border
          },
          ticks: {
            precision: 0,
            color: textMuted,
            callback: (val) => val.toLocaleString()
          }
        }
      }
    }
  });
}

async function loadPlayerProfile(id) {
  if (!id) return;

  const newPath = `/player/${id}`;
  window.history.replaceState({}, "", newPath);

  el("emptyState").style.display = "none";
  el("errorState").style.display = "none";
  el("playerProfile").style.display = "block";
  el("chartLoading").style.display = "flex";

  el("displayIgn").innerText = "Loading...";
  el("displayUuid").innerText = id;
  el("displayGain7d").innerText = "---";
  el("displayGain30d").innerText = "---";
  el("displayCurrentScore").innerText = "---";

  const selectedGame = games.find(g => g.id === Number(currentGameId));
  const scoreType = selectedGame?.scoreType || "Wins";
  el("scoreLabel").innerText = `Total ${scoreType}`;

  try {
    const scoreData = await apiFetch(`/player/${id}/scores`);
    currentPlayer = { id, data: scoreData };

    el("displayIgn").innerText = scoreData.ign;
    el("displayUuid").innerText = formatUuid(scoreData.player);
    
    if (scoreData.rows?.length) {
      el("displayGain7d").innerText = scoreData.gain7d.toLocaleString();
      el("displayGain30d").innerText = scoreData.gain30d.toLocaleString();

      const currentScore = scoreData.rows[scoreData.rows.length - 1].score;
      el("displayCurrentScore").innerText = currentScore.toLocaleString();
      renderChart(scoreData.rows, scoreData.ign, scoreType);
    } else {
      el("displayGain7d").innerText = "0";
      el("displayGain30d").innerText = "0";
      el("displayCurrentScore").innerText = "No data";
      if (chart) chart.destroy();
    }
  } catch (err) {
    console.error(err);
    el("playerProfile").style.display = "none";
    el("errorState").style.display = "block";
    el("errorTitle").innerText = "Player Not Found";
    const currentGame = games.find(g => g.id === Number(currentGameId));
    el("errorMessage").innerText = `Player '${id}' is not on the ${currentGame.displayName} leaderboard.`;
  } finally {
    el("chartLoading").style.display = "none";
  }
}

function resetSearch() {
  window.history.replaceState({}, "", "/");

  el("errorState").style.display = "none";
  el("playerProfile").style.display = "none";
  el("emptyState").style.display = "block";
  el("playerSearch").value = "";
  el("playerSearch").focus();
}

async function init() {
  const pathname = window.location.pathname;
  if (pathname.startsWith("/player/")) {
    currentPlayer = { id: decodeURIComponent(pathname.split("/").pop()), data: null };
  }
  
  resetSearch()
  try {
    const activeBtn = el("daysToggle").querySelector(".toggle-btn.active");
    if (activeBtn) {
      currentDays = Number(activeBtn.dataset.days);
    }

    const fetchedGames = await apiFetch("/games");
    games = fetchedGames.filter(g => g.shouldTrack);
    const selector = el("gameSelector");
    games.forEach(game => {
      if (!enabledGames.includes(game.name)) return;
      const opt = document.createElement("option");
      opt.value = game.id;
      opt.textContent = game.displayName;
      opt.selected = game.id === currentGameId;
      selector.appendChild(opt);
    });

    selector.onchange = (e) => {
      currentGameId = Number(e.target.value) || null;
      if (currentPlayer) currentPlayer.data = null;
      updateWarningBanner();
      loadTopGainers();
      loadLeaderboard();
      if (currentPlayer) {
        const savedId = currentPlayer.id;
        currentPlayer = null;
        loadPlayerProfile(savedId);
      }
    };

    el("daysToggle").onclick = (e) => {
      const btn = e.target.closest(".toggle-btn");
      if (!btn) return;

      if (currentDays === Number(btn.dataset.days)) return;

      currentDays = Number(btn.dataset.days);

      el("daysToggle").querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      loadTopGainers();
      if (currentPlayer && currentPlayer.data) {
        const selectedGame = games.find(g => g.id === Number(currentGameId));
        const scoreType = selectedGame?.scoreType || "Wins";
        renderChart(currentPlayer.data.rows, currentPlayer.data.ign, scoreType);
      }
    };

    updateWarningBanner();

    await Promise.all([
      loadTopGainers(),
      loadLeaderboard(),
      currentPlayer ? loadPlayerProfile(currentPlayer.id) : Promise.resolve(),
    ]);
  } catch (err) {
    console.error("Initialization failed", err);
  }

  el("loadPlayerBtn").onclick = () => {
    const query = el("playerSearch").value.trim();
    if (query) loadPlayerProfile(query);
  };

  el("playerSearch").onkeyup = (e) => {
    if (e.key === "Enter") {
      const query = el("playerSearch").value.trim();
      if (query) loadPlayerProfile(query);
    }
  };

  // Listen for theme changes to update chart colors
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === "theme") {
        updateAllChartsTheme();
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true });
}

function updateAllChartsTheme() {
  const primary = getStyle('--primary');
  const textMuted = getStyle('--text-muted');
  const border = getStyle('--border');
  const text = getStyle('--text');
  const cardBg = getStyle('--card-bg');

  if (chart) {
    chart.options.scales.x.ticks.color = textMuted;
    chart.options.scales.y.ticks.color = textMuted;
    chart.options.scales.y.grid.color = border;

    chart.options.plugins.tooltip.backgroundColor = cardBg;
    chart.options.plugins.tooltip.titleColor = text;
    chart.options.plugins.tooltip.bodyColor = text;
    chart.options.plugins.tooltip.borderColor = border;

    chart.update('none');
  }

  if (leaderboardChart) {
    leaderboardChart.data.datasets[0].borderColor = primary;
    leaderboardChart.data.datasets[0].backgroundColor = `${primary}b3`;

    leaderboardChart.options.scales.xTop.grid.color = border;
    leaderboardChart.options.scales.xTop.ticks.color = textMuted;
    leaderboardChart.options.scales.xBottom.grid.color = border;
    leaderboardChart.options.scales.xBottom.ticks.color = textMuted;
    leaderboardChart.options.scales.y.grid.color = border;
    leaderboardChart.options.scales.y.ticks.color = textMuted;

    leaderboardChart.options.plugins.tooltip.backgroundColor = cardBg;
    leaderboardChart.options.plugins.tooltip.titleColor = text;
    leaderboardChart.options.plugins.tooltip.bodyColor = text;
    leaderboardChart.options.plugins.tooltip.borderColor = border;

    leaderboardChart.update('none');
  }
}

function updateWarningBanner() {
  const selectedGame = games.find((g) => g.id === Number(currentGameId));
  const warningText = el("warningText");
  if (!selectedGame || !warningText) return;

  const dateStr = TRACKING_START_DATES[selectedGame.name] ?? "recently";
  warningText.textContent = `Notice: Historical data is currently only available starting from ${dateStr}.`;
}

async function loadTopGainers() {
  const container = el("topGainers");
  container.innerHTML = '<div class="text-muted centered-p" style="padding: 1.5rem;">Loading...</div>';

  try {
    const topGainers = await apiFetch("/top-gainers");
    renderTopGainers(topGainers);
  } catch (err) {
    el("topGainers").innerHTML = '<div class="text-muted centered-p error-text" style="padding: 1.5rem;">Failed to load data</div>';
  }
}

async function loadLeaderboard() {
  el("leaderboardLoading").style.display = "flex";
  try {
    const leaderboard = await apiFetch("/leaderboard");
    renderLeaderboardChart(leaderboard);
  } catch (err) {
    console.error("Failed to load leaderboard", err);
  } finally {
    el("leaderboardLoading").style.display = "none";
  }
}

function renderLeaderboardChart(data) {
  const ctx = el("leaderboardChart").getContext("2d");
  
  if (leaderboardChart) leaderboardChart.destroy();

  const selectedGame = games.find(g => g.id === Number(currentGameId));
  const scoreType = selectedGame?.scoreType || "Score";
  const gameDisplayName = selectedGame?.displayName || "Full";
  
  let titleText = `<span class="title-main">${gameDisplayName} Leaderboard</span>`;
  if (data.timestamp) {
    const date = new Date(data.timestamp);
    titleText += `<div class="title-metadata">`;
    titleText += `<span class="text-muted" style="font-size: 0.8rem; font-weight: normal; margin-left: 0.5rem;">${date.toLocaleString()}</span>`;
    titleText += `<span class="info-icon" title="This is the last submitted leaderboard at this timestamp">i</span>`;
    titleText += `</div>`;
  }
  el("leaderboardTitle").innerHTML = titleText;

  const rows = data.rows || [];

  const values = rows.map(d => d.score);
  const max = Math.max(...values);

  const primary = getStyle('--primary');
  const textMuted = getStyle('--text-muted');
  const border = getStyle('--border');
  const text = getStyle('--text');
  const cardBg = getStyle('--card-bg');

  leaderboardChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map((d, i) => `${i + 1}. ${d.ign}`),
      datasets: [{
        label: scoreType,
        data: rows.map(d => d.score),
        backgroundColor: `${primary}b3`,
        borderColor: primary,
        borderWidth: 0,
        borderRadius: 5,
        hoverBackgroundColor: "#2563eb",
        xAxisID: 'xBottom'
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cardBg,
          titleColor: text,
          bodyColor: text,
          borderColor: border,
          borderWidth: 1,
          padding: 12,
          boxPadding: 4,
          usePointStyle: true,
          callbacks: {
            label: (context) => {
              return `${scoreType}: ${context.parsed.x.toLocaleString()}`;
            }
          }
        }
      },
      scales: {
        xTop: {
          type: 'linear',
          position: 'top',
          max,
          beginAtZero: true,
          grid: {
            color: border
          },
          ticks: {
            color: textMuted,
            callback: (val) => val.toLocaleString()
          }
        },
        xBottom: {
          type: 'linear',
          position: 'bottom',
          max,
          beginAtZero: true,
          grid: {
            drawOnChartArea: false,
            color: border
          },
          ticks: {
            color: textMuted,
            callback: (val) => val.toLocaleString()
          }
        },
        y: {
          grid: {
            display: false,
            drawBorder: false
          },
          ticks: {
            autoSkip: false,
            padding: 10,
            crossAlign: 'far',
            color: textMuted,
            font: { size: 12 }
          }
        }
      },
      onClick: (e, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const player = rows[index];
          loadPlayerProfile(player.player);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    }
  });

  // Dynamically adjust height based on number of players
  const chartHeight = Math.max(400, rows.length * 25);
  el("leaderboardChart").parentElement.style.height = `${chartHeight}px`;
}

init();

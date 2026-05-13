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
let currentGame = undefined;
let currentDays = 30;
let displayMode = "wins";
/** @type {{ id: string, ign: string, data: Object[] } | undefined} */
let currentPlayer = undefined;
let autocompleteSelectedIndex = -1;
const enabledGames = ["team_eggwars", "solo_skywars", "free_for_all"];

const TRACKING_START_DATES = {
  solo_skywars: "April 2nd, 2026",
  team_eggwars: "March 19th, 2026",
  free_for_all: "April 27th, 2026",
};

const el = (id) => document.getElementById(id);

async function apiFetch(endpoint) {
  const isInternal = endpoint.startsWith("/");
  let url = endpoint;

  if (isInternal && currentGame) {
    if (url.startsWith("/top-gainers") || url.startsWith("/leaderboard")) {
      url = `/games/${currentGame.id}${url}`;
    } else if (url.startsWith("/player/")) {
      const parts = url.split("/");
      // parts[0] is "", parts[1] is "player", parts[2] is ":id", parts[3] is "scores"
      url = `/games/${currentGame.id}/player/${parts[2]}`;
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
        <th class="text-center leaderboardScoreType">Wins</th>
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
      if (currentPlayer && (currentPlayer.id === row.player)) return;
      loadPlayerProfile(row.player);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    tbody.appendChild(tr);
    i++;
  });
  container.innerHTML = "";
  container.appendChild(table);
  updateScoreTypeLabels();
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
      y: displayMode === "wins" ? r.score : r.position
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

  const label = displayMode === "wins" ? scoreType : "Position";

  chart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [{
        label: label,
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
      animation: false,
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
            },
            label: (context) => {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += context.parsed.y.toLocaleString();
              }
              return label;
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
          title: {
            display: true,
            text: label,
            color: textMuted,
            font: {
              weight: 'bold'
            }
          },
          reverse: displayMode === "position",
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

async function updatePath() {
  if (!currentGame) return;

  let newPath = `/games/${currentGame.name}`;
  if (currentPlayer && currentPlayer.ign) {
    newPath += `/player/${currentPlayer.ign}`;
  }
  window.history.replaceState({}, "", newPath);
}

async function loadPlayerProfile(idOrIgn, forceFetch = false) {
  if (!idOrIgn) return;

  const scoreType = currentGame?.scoreType || "Wins";

  if (!forceFetch && currentPlayer && (currentPlayer.id === idOrIgn || currentPlayer.ign === idOrIgn) && currentPlayer.data) {
    renderPlayerProfile(currentPlayer.data, scoreType);
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
    const scoreData = await apiFetch(`/player/${idOrIgn}/scores`);
    currentPlayer = { id: scoreData.player, ign: scoreData.ign, data: scoreData };

    await updatePath();
    renderPlayerProfile(scoreData, scoreType);
  } catch (err) {
    console.error(err);
    el("playerProfile").style.display = "none";
    el("errorState").style.display = "block";
    el("errorTitle").innerText = "Player Not Found";
    el("errorMessage").innerText = `Player '${idOrIgn}' is not on the ${currentGame?.displayName || "selected game"} leaderboard.`;
  } finally {
    el("chartLoading").style.display = "none";
  }
}

function renderPlayerProfile(scoreData, scoreType) {
  el("emptyState").style.display = "none";
  el("errorState").style.display = "none";
  el("playerProfile").style.display = "block";

  el("displayIgn").innerText = scoreData.ign;
  el("displayUuid").innerText = formatUuid(scoreData.player);

  const setGainEl = (id, value, showPlus) => {
    const elem = el(id);
    elem.innerText = (showPlus && value > 0 ? "+" : "") + value.toLocaleString();
    elem.classList.remove("text-positive", "text-negative");
    if (value > 0) elem.classList.add("text-positive");
    else if (value < 0) elem.classList.add("text-negative");
  };

  if (scoreData.rows?.length) {
    if (displayMode === "wins") {
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
        const targetTime = now - (days * dayMs);
        const oldRow = rows.find(r => new Date(r.timestamp).getTime() >= targetTime);
        if (!oldRow) return 0;
        return oldRow.position - currentPos; // If old was 10 and current is 5, gain is +5
      };

      const gain7d = getGain(7);
      const gain30d = getGain(30);

      setGainEl("displayGain7d", gain7d, true);
      setGainEl("displayGain30d", gain30d, true);
      el("displayCurrentScore").innerText = "#" + currentPos.toLocaleString();
    }

    renderChart(scoreData.rows, scoreData.ign, scoreType);
    updateScoreTypeLabels();
  } else {
    el("displayGain7d").innerText = "0";
    el("displayGain30d").innerText = "0";
    el("displayCurrentScore").innerText = "No data";
    if (chart) chart.destroy();
  }
}

function showDropdown(items) {
  const dropdown = el("playerSearchDropdown");
  dropdown.innerHTML = "";
  autocompleteSelectedIndex = -1;
  if (!items.length) {
    dropdown.hidden = true;
    return;
  }
  items.forEach((ign) => {
    const li = document.createElement("li");
    li.textContent = ign;
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      el("playerSearch").value = ign;
      dropdown.hidden = true;
      autocompleteSelectedIndex = -1;
      loadPlayerProfile(ign);
    });
    dropdown.appendChild(li);
  });
  dropdown.hidden = false;
}

function hideDropdown() {
  el("playerSearchDropdown").hidden = true;
  autocompleteSelectedIndex = -1;
}

function updateDropdownHighlight() {
  const items = el("playerSearchDropdown").querySelectorAll("li");
  items.forEach((li, i) => li.classList.toggle("active", i === autocompleteSelectedIndex));
}

function resetSearch() {
  updatePath();
  hideDropdown();

  el("errorState").style.display = "none";
  el("playerProfile").style.display = "none";
  el("emptyState").style.display = "block";
  el("playerSearch").value = "";
  el("playerSearch").focus();
}

async function init() {
  const pathname = window.location.pathname;
  const parts = pathname.split("/").filter(Boolean);

  // Pattern: /games/:gameName/player/:ign or /games/:gameName
  let initialGameName = null;
  let initialPlayerIgn = null;

  if (parts.length > 0) {
    if (parts[0] === "games" && parts.length >= 2) {
      initialGameName = parts[1];
      if (parts[2] === "player" && parts.length >= 4) {
        initialPlayerIgn = parts[3];
      } else if (parts.length > 2) {
        // Invalid structure under /games/
        window.location.href = "/";
        return;
      }
    } else {
      // Invalid path (doesn't start with /games/ or just /games)
      window.location.href = "/";
      return;
    }
  }

  try {
    const activeBtn = el("daysToggle").querySelector(".toggle-btn.active");
    if (activeBtn) {
      currentDays = Number(activeBtn.dataset.days);
    }

    const fetchedGames = await apiFetch("/games");
    games = fetchedGames.filter(g => g.shouldTrack);

    // Default to Team Eggwars if no game found in path
    if (!initialGameName) {
      currentGame = games.find(g => g.name === 'team_eggwars') || games[0];
    }

    if (initialGameName) {
      const game = games.find(g => g.name === initialGameName);
      if (game) {
        currentGame = game;
      } else {
        // Game not found
        window.location.href = "/";
        return;
      }
    }

    const selector = el("gameSelector");
    games.forEach(game => {
      if (!enabledGames.includes(game.name)) return;
      const opt = document.createElement("option");
      opt.value = game.id;
      opt.textContent = game.displayName;
      opt.selected = game.id === currentGame?.id;
      selector.appendChild(opt);
    });

    selector.onchange = (e) => {
      const gameId = Number(e.target.value);
      currentGame = games.find(g => g.id === gameId) || null;
      if (currentPlayer) currentPlayer.data = null;
      updateWarningBanner();
      updateLeaderboardDescription();
      updatePath();
      loadTopGainers();
      loadLeaderboard();
      if (currentPlayer) {
        loadPlayerProfile(currentPlayer.ign, true);
      }
    };

    el("daysToggle").onclick = (e) => {
      const btn = e.target.closest(".toggle-btn");
      if (!btn) return;

      if (currentDays === Number(btn.dataset.days)) return;

      currentDays = Number(btn.dataset.days);

      el("daysToggle").querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      updateLeaderboardDescription();

      loadTopGainers();
      loadLeaderboard();
      if (currentPlayer && currentPlayer.data) {
        const scoreType = currentGame?.scoreType || "Wins";
        renderChart(currentPlayer.data.rows, currentPlayer.ign, scoreType);
      }
    };

    updateWarningBanner();
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

  let autocompleteTimeout = null;

  el("loadPlayerBtn").onclick = () => {
    const query = el("playerSearch").value.trim();
    if (query) {
      hideDropdown();
      loadPlayerProfile(query);
    }
  };

  el("displayModeToggle").onclick = (e) => {
    const btn = e.target.closest(".toggle-btn");
    if (!btn || btn.classList.contains("active")) return;

    el("displayModeToggle").querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    displayMode = btn.dataset.mode;

    if (currentPlayer && currentPlayer.data) {
      loadPlayerProfile(currentPlayer.ign);
    }
  };

  el("playerSearch").onkeyup = (e) => {
    if (e.key === "Enter") {
      const dropdown = el("playerSearchDropdown");
      const items = dropdown.querySelectorAll("li");
      if (!dropdown.hidden && autocompleteSelectedIndex >= 0 && items[autocompleteSelectedIndex]) {
        const ign = items[autocompleteSelectedIndex].textContent;
        el("playerSearch").value = ign;
        hideDropdown();
        loadPlayerProfile(ign);
      } else {
        const query = el("playerSearch").value.trim();
        if (query) {
          hideDropdown();
          loadPlayerProfile(query);
        }
      }
    }
  };

  el("playerSearch").addEventListener("input", () => {
    clearTimeout(autocompleteTimeout);
    const q = el("playerSearch").value.trim();
    if (q.length < 2) {
      hideDropdown();
      return;
    }
    autocompleteTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/players?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data = await res.json();
        showDropdown(data);
      } catch {}
    }, 250);
  });

  el("playerSearch").addEventListener("keydown", (e) => {
    const dropdown = el("playerSearchDropdown");
    if (dropdown.hidden) return;
    const items = dropdown.querySelectorAll("li");
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      autocompleteSelectedIndex = Math.min(autocompleteSelectedIndex + 1, items.length - 1);
      updateDropdownHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      autocompleteSelectedIndex = Math.max(autocompleteSelectedIndex - 1, -1);
      updateDropdownHighlight();
    } else if (e.key === "Escape") {
      hideDropdown();
    }
  });

  el("playerSearch").addEventListener("blur", () => {
    setTimeout(hideDropdown, 150);
  });

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
    chart.options.scales.y.title.color = textMuted;

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
    leaderboardChart.options.scales.xTop.title.color = textMuted;
    leaderboardChart.options.scales.xBottom.grid.color = border;
    leaderboardChart.options.scales.xBottom.ticks.color = textMuted;
    leaderboardChart.options.scales.xBottom.title.color = textMuted;
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
  const warningText = el("warningText");
  if (!currentGame || !warningText) return;

  const dateStr = TRACKING_START_DATES[currentGame.name] ?? "recently";
  warningText.textContent = `Notice: Historical data for ${currentGame.displayName} is currently only available starting from ${dateStr}.`;
}

function updateScoreTypeLabels() {
  const scoreTypeEls = document.querySelectorAll(".leaderboardScoreType");
  const scoreType = currentGame?.scoreType || "Wins";
  scoreTypeEls.forEach(el => {
    el.textContent = scoreType;
  });

  const gainTypeEls = document.querySelectorAll(".gainTypeLabel");
  gainTypeEls.forEach(el => {
    el.textContent = displayMode === "wins" ? scoreType : "Positions";
  });

  const currentTypeEls = document.querySelectorAll(".currentTypeLabel");
  currentTypeEls.forEach(el => {
    el.textContent = displayMode === "wins" ? `Total ${scoreType}` : "Position";
  });
}

function updateLeaderboardDescription() {
  const rangeEl = el("leaderboardTimeRange");
  const summaryTextEl = el("leaderboardSummaryText");

  updateScoreTypeLabels();

  if (!rangeEl) return;

  const timeText = currentDays === 7 ? "last 7 days" : "last month";
  rangeEl.textContent = `All changes are relative to the ${timeText}.`;

  if (summaryTextEl) {
    summaryTextEl.textContent = `The summary below lists players who entered or left the leaderboard in the ${timeText}.`;
  }
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
    const leaderboard = await apiFetch(`/leaderboard?days=${currentDays}`);
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

  const scoreType = currentGame?.scoreType || "Score";
  const gameDisplayName = currentGame?.displayName || "Full";

  let titleText = `<span class="title-main">${gameDisplayName} Leaderboard</span>`;
  if (data.timestamp) {
    const date = new Date(data.timestamp);
    titleText += `<div class="title-metadata">`;
    titleText += `<span class="text-muted" style="font-size: 0.8rem; font-weight: normal; margin-left: 0.5rem;">${date.toLocaleString()}</span>`;
    titleText += `<span class="info-icon" title="This is the last submitted leaderboard at this timestamp">i</span>`;
    titleText += `</div>`;
  }
  el("leaderboardTitle").innerHTML = titleText;

    // Update summary
    const summaryEl = el("leaderboardSummary");
    const activityList = el("activityList");

    if (summaryEl && data.rows) {
      const newPlayers = data.rows.filter(r => r.isNew);
      const leftPlayers = data.departed || [];

      if (newPlayers.length === 0 && leftPlayers.length === 0) {
        summaryEl.style.display = "flex";

        activityList.innerHTML = `
          <div class="activity-feed-item" style="color: var(--text-muted); border-left-color: var(--border); font-style: italic; opacity: 0.8;">
            <div class="activity-icon" style="background: var(--text-muted); opacity: 0.3;"></div>
            <span>No recent entries to the leaderboard</span>
          </div>`;
      } else {
        summaryEl.style.display = "flex";

        let activityHtml = '';

        if (newPlayers.length > 0) {
          newPlayers.forEach(p => {
            activityHtml += `
              <div class="activity-feed-item activity-joined">
                <div class="activity-icon"></div>
                <span><span class="activity-player">${p.ign}</span> entered the leaderboard</span>
              </div>`;
          });
        }

        if (leftPlayers.length > 0) {
          leftPlayers.forEach(p => {
            activityHtml += `
              <div class="activity-feed-item activity-left">
                <div class="activity-icon"></div>
                <span><span class="activity-player">${p.ign}</span> left the leaderboard</span>
              </div>`;
          });
        }

        activityList.innerHTML = activityHtml;
      }
}

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
    plugins: [{
      id: 'rankChangeLabels',
      afterDraw: (chart) => {
        const { ctx, scales: { y } } = chart;
        const ticks = y.getTicks();

        ctx.save();
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        ticks.forEach((tick, index) => {
          const row = rows[index];
          if (!row) return;

          let text = '';
          let color = '';

          if (row.isNew) {
            text = 'NEW';
            color = '#3b82f6';
          } else if (row.rankChange !== null && row.rankChange !== 0) {
            text = (row.rankChange > 0 ? '+' : '') + row.rankChange;
            color = row.rankChange > 0 ? '#10b981' : '#ef4444';
          }

          if (text) {
            const yPos = y.getPixelForTick(index);
            // Draw it slightly to the left of the player name (which is aligned 'far')
            // Or maybe on the right side of the labels?
            // Since y.ticks.crossAlign is 'far', the labels are right-aligned against the axis.
            // We want the rank change to be even further right or left?
            // "align the position changes to the right" -> likely means aligned in a column.

            // Align rank change to the right of the label area (near the axis line)
            const xPos = y.right - 5;
            ctx.fillStyle = color;
            ctx.fillText(text, xPos, yPos);
          }
        });
        ctx.restore();
      }
    }],
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
              const d = rows[context.dataIndex];
              let label = `${scoreType}: ${context.parsed.x.toLocaleString()}`;
              if (d.isNew) {
                label += " (New Entry)";
              } else if (d.rankChange !== null && d.rankChange !== 0) {
                label += ` (Position Change: ${d.rankChange > 0 ? '+' : ''}${d.rankChange})`;
              }
              return label;
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
          title: {
            display: true,
            text: `total ${scoreType}`,
            color: textMuted,
            font: {
              weight: 'bold'
            }
          },
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
          title: {
            display: true,
            text: `total ${scoreType}`,
            color: textMuted,
            font: {
              weight: 'bold'
            }
          },
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
            padding: 15,
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

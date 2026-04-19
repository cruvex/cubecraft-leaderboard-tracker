const apiBase = "/api";
let chart = null;
let leaderboardChart = null;
let games = [];
let currentGameId = 11;
let currentDays = 30;
let currentPlayerId = null;
const enabledGames = ["team_eggwars", "solo_skywars"];

const TRACKING_START_DATES = {
  solo_skywars: "April 2nd, 2026",
  team_eggwars: "March 19th, 2026",
};

const el = (id) => document.getElementById(id);

async function apiFetch(endpoint) {
  const isInternal = endpoint.startsWith("/");
  const separator = endpoint.includes("?") ? "&" : "?";
  let url = (isInternal && currentGameId) ? `${endpoint}${separator}gameId=${currentGameId}` : endpoint;
  
  if (isInternal) {
    const daySeparator = url.includes("?") ? "&" : "?";
    url = `${url}${daySeparator}days=${currentDays}`;
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
  container.innerHTML = "";
  
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
        <th class="text-center">Gain</th>
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
      loadPlayerProfile(row.player);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    tbody.appendChild(tr);
    i++;
  });
  
  container.appendChild(table);
}


function renderChart(rows, ign, scoreType = "Score") {
  const ctx = el("scoreChart").getContext("2d");
  
  const now = Date.now();
  const maxTime = now;
  const minTime = now - (currentDays * 24 * 60 * 60 * 1000);

  const chartData = rows.map(r => ({
    x: new Date(r.timestamp).getTime(),
    y: r.score
  }));

  if (chart) chart.destroy();

  const minVal = Math.min(...chartData.map(d => d.y));
  const maxVal = Math.max(...chartData.map(d => d.y));
  const padding = maxVal === minVal ? 1 : Math.max(1, Math.ceil((maxVal - minVal) * 0.1));

  chart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [{
        label: `${scoreType} History`,
        data: chartData,
        borderColor: "#2563eb",
        backgroundColor: "rgba(37, 99, 235, 0.1)",
        fill: true,
        tension: 0,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#2563eb",
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
            callback: (val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          }
        },
        y: {
          beginAtZero: false,
          suggestedMin: minVal - padding,
          suggestedMax: maxVal + padding,
          ticks: {
            precision: 0,
            callback: (val) => val.toLocaleString()
          }
        }
      }
    }
  });
}

async function loadPlayerProfile(id) {
  if (!id) return;

  // Update URL path
  const newPath = `/player/${id}`;
  window.history.replaceState({}, "", newPath);
  currentPlayerId = id;

  el("emptyState").style.display = "none";
  el("errorState").style.display = "none";
  el("playerProfile").style.display = "block";
  el("chartLoading").style.display = "flex";
  
  // Reset fields
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
    el("errorMessage").innerText = `We couldn't find data for "${id}". Check the name or UUID and try again.`;
  } finally {
    el("chartLoading").style.display = "none";
  }
}

function resetSearch() {
  // Clear URL path
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
    currentPlayerId = decodeURIComponent(pathname.split("/").pop());
  }
  
  resetSearch()
  try {
    // Sync currentDays with the initial value of the selector
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
      updateWarningBanner();
      // Refresh data
      loadTopGainers();
      loadLeaderboard();
      if (currentPlayerId) loadPlayerProfile(currentPlayerId);
    };

    el("daysToggle").onclick = (e) => {
      const btn = e.target.closest(".toggle-btn");
      if (!btn) return;
      
      currentDays = Number(btn.dataset.days);
      
      // Update UI
      el("daysToggle").querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      loadTopGainers();
    };

    updateWarningBanner();

    await Promise.all([
      loadTopGainers(),
      loadLeaderboard(),
      currentPlayerId ? loadPlayerProfile(currentPlayerId) : Promise.resolve(),
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
  
  let titleText = `${gameDisplayName} Leaderboard`;
  if (data.timestamp) {
    const date = new Date(data.timestamp);
    titleText += ` <span class="text-muted" style="font-size: 0.8rem; font-weight: normal; margin-left: 0.5rem;">${date.toLocaleString()}</span>`;
  }
  el("leaderboardTitle").innerHTML = titleText;

  const rows = data.rows || [];

  leaderboardChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map((d, i) => `${i + 1}. ${d.ign}`),
      datasets: [{
        label: scoreType,
        data: rows.map(d => d.score),
        backgroundColor: "rgba(37, 99, 235, 0.7)",
        borderColor: "#2563eb",
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              return `${scoreType}: ${context.parsed.x.toLocaleString()}`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: false,
          ticks: {
            callback: (val) => val.toLocaleString()
          }
        },
        y: {
          ticks: {
            autoSkip: false,
            padding: 10,
            crossAlign: 'far',
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

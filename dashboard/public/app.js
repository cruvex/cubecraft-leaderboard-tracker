const apiBase = "/api";
let chart = null;
let games = [];
let currentGameId = null;
let currentDays = 30;

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
<<<<<<< Updated upstream
    container.innerHTML = '<div class="text-muted">No data available</div>';
=======
    container.innerHTML = '<div class="text-muted centered-p" style="padding: 2rem;">No data available</div>';
>>>>>>> Stashed changes
    return;
  }

  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
<<<<<<< Updated upstream
        <th>Player</th>
        <th style="text-align: right;">Gain</th>
=======
        <th class="text-center">Player</th>
        <th class="text-center">Gain</th>
>>>>>>> Stashed changes
      </tr>
    </thead>
    <tbody></tbody>
  `;
  
  const tbody = table.querySelector("tbody");
  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.innerHTML = `
      <td>
<<<<<<< Updated upstream
        <div style="font-weight: 600;">${row.ign}</div>
      </td>
      <td style="text-align: right;">
=======
        <div class="player-ign-cell">${row.ign}</div>
      </td>
      <td class="text-center">
>>>>>>> Stashed changes
        <span class="badge">+${row.score_gain.toLocaleString()}</span>
      </td>
    `;
    tr.onclick = () => loadPlayerProfile(row.player);
    tbody.appendChild(tr);
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

<<<<<<< Updated upstream
=======
  const minVal = Math.min(...chartData.map(d => d.y));
  const maxVal = Math.max(...chartData.map(d => d.y));
  const padding = maxVal === minVal ? 1 : Math.max(1, Math.ceil((maxVal - minVal) * 0.1));

>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
=======
          suggestedMin: minVal - padding,
          suggestedMax: maxVal + padding,
>>>>>>> Stashed changes
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
  
<<<<<<< Updated upstream
=======
  // Update URL query parameters
  const url = new URL(window.location.href);
  url.searchParams.set("player", id);
  window.history.replaceState({}, "", url);

>>>>>>> Stashed changes
  el("emptyState").style.display = "none";
  el("errorState").style.display = "none";
  el("playerProfile").style.display = "block";
  el("chartLoading").style.display = "flex";
  
  // Reset fields
  el("displayIgn").innerText = "Loading...";
  el("displayUuid").innerText = id;
  el("displayGain").innerText = "---";
  el("displayCurrentScore").innerText = "---";

  const selectedGame = games.find(g => g.id === Number(currentGameId));
  const scoreType = selectedGame?.scoreType || "Score";
  el("gainLabel").innerText = `${currentDays}d ${scoreType} Gain`;
  el("scoreLabel").innerText = `Current ${scoreType}`;

  try {
    const [gainData, scoreData] = await Promise.all([
      apiFetch(`/player/${id}/score_gain`),
      apiFetch(`/player/${id}/scores`)
    ]);

    el("displayIgn").innerText = gainData.ign;
    el("displayUuid").innerText = formatUuid(gainData.player);
    el("displayGain").innerText = gainData.score_gain.toLocaleString();
    
    if (scoreData.rows?.length) {
      const currentScore = scoreData.rows[scoreData.rows.length - 1].score;
      el("displayCurrentScore").innerText = currentScore.toLocaleString();
      renderChart(scoreData.rows, scoreData.ign, scoreType);
    } else {
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
<<<<<<< Updated upstream
=======
  // Clear URL query parameters
  const url = new URL(window.location.href);
  url.searchParams.delete("player");
  window.history.replaceState({}, "", url);

>>>>>>> Stashed changes
  el("errorState").style.display = "none";
  el("playerProfile").style.display = "none";
  el("emptyState").style.display = "block";
  el("playerSearch").value = "";
  el("playerSearch").focus();
}

async function init() {
<<<<<<< Updated upstream
  try {
    currentDays = Number(el("daysSelector").value);
=======
  const url = new URL(window.location.href);
  const playerId = url.searchParams.get("player");
  
  resetSearch()
  try {
    // Sync currentDays with the initial value of the selector
    const activeBtn = el("daysToggle").querySelector(".toggle-btn.active");
    if (activeBtn) {
      currentDays = Number(activeBtn.dataset.days);
    }
>>>>>>> Stashed changes

    const fetchedGames = await apiFetch("/games");
    games = fetchedGames.filter(g => g.shouldTrack);
    const selector = el("gameSelector");
    games.forEach(game => {
      const opt = document.createElement("option");
      opt.value = game.id;
      opt.textContent = game.displayName;
      selector.appendChild(opt);
    });

    selector.onchange = (e) => {
      currentGameId = e.target.value || null;
      // Refresh data
      refreshAll();
    };

<<<<<<< Updated upstream
    el("daysSelector").onchange = (e) => {
      currentDays = Number(e.target.value);
=======
    el("daysToggle").onclick = (e) => {
      const btn = e.target.closest(".toggle-btn");
      if (!btn) return;
      
      currentDays = Number(btn.dataset.days);
      
      // Update UI
      el("daysToggle").querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
>>>>>>> Stashed changes
      refreshAll();
    };

    refreshAll();
<<<<<<< Updated upstream
=======
    
    // Load player from query params if captured before resetSearch
    if (playerId) {
      loadPlayerProfile(playerId);
    }
>>>>>>> Stashed changes
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

async function refreshAll() {
  try {
<<<<<<< Updated upstream
    el("topGainers").innerText = "Loading...";
    const topGainers = await apiFetch("/top-gainers");
    renderTopGainers(topGainers);
  } catch (err) {
    el("topGainers").innerText = "Failed to load top gainers";
=======
    const container = el("topGainers");
    container.innerHTML = '<div class="text-muted centered-p" style="padding: 1.5rem;">Loading...</div>';
    const topGainers = await apiFetch("/top-gainers");
    renderTopGainers(topGainers);
  } catch (err) {
    el("topGainers").innerHTML = '<div class="text-muted centered-p error-text" style="padding: 1.5rem;">Failed to load data</div>';
>>>>>>> Stashed changes
  }

  // If a player is already being viewed, refresh their profile too
  if (el("playerProfile").style.display === "block") {
    const currentUuid = el("displayUuid").innerText;
    if (currentUuid && currentUuid !== "---") {
      loadPlayerProfile(currentUuid);
    }
  }
}

init();

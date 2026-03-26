const apiBase = "/api";
let chart = null;
let games = [];
let currentGameId = null;

const el = (id) => document.getElementById(id);

async function apiFetch(endpoint) {
  const isInternal = endpoint.startsWith("/");
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = (isInternal && currentGameId) ? `${endpoint}${separator}gameId=${currentGameId}` : endpoint;
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
    container.innerHTML = '<div class="text-muted">No data available</div>';
    return;
  }

  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Player</th>
        <th style="text-align: right;">Gain</th>
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
        <div style="font-weight: 600;">${row.ign}</div>
      </td>
      <td style="text-align: right;">
        <span class="badge">+${row.score_gain.toLocaleString()}</span>
      </td>
    `;
    tr.onclick = () => loadPlayerProfile(row.player);
    tbody.appendChild(tr);
  });
  
  container.appendChild(table);
}

function normalizeData(rows, intervalMs = 6 * 60 * 60 * 1000) {
  if (!rows || rows.length < 2) return rows;

  const firstDate = new Date(rows[0].timestamp);
  const lastDate = new Date(rows[rows.length - 1].timestamp);
  
  // Align start to the nearest interval boundary below
  const startTime = Math.floor(firstDate.getTime() / intervalMs) * intervalMs;
  const endTime = Math.ceil(lastDate.getTime() / intervalMs) * intervalMs;

  const normalized = [];
  let currentRowIndex = 0;

  for (let t = startTime; t <= endTime; t += intervalMs) {
    // Find the latest score that happened at or before this interval's time 't'
    while (currentRowIndex < rows.length && new Date(rows[currentRowIndex].timestamp).getTime() <= t) {
      currentRowIndex++;
    }
    
    // We want the row just before the one we found (which is the last one at or before 't')
    if (currentRowIndex > 0) {
      normalized.push({
        timestamp: new Date(t).toISOString(),
        score: rows[currentRowIndex - 1].score
      });
    } else {
      // If no data yet before this 't', just use the first point as a placeholder
      normalized.push({
        timestamp: new Date(t).toISOString(),
        score: rows[0].score
      });
    }
  }

  return normalized;
}

function renderChart(rows, ign, scoreType = "Score") {
  const ctx = el("scoreChart").getContext("2d");
  
  // Normalize to 6h intervals for 30d view
  const normalizedRows = normalizeData(rows, 6 * 60 * 60 * 1000);

  const labels = normalizedRows.map(r => new Date(r.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const data = normalizedRows.map(r => r.score);

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: `${scoreType} History`,
        data,
        borderColor: "#2563eb",
        backgroundColor: "rgba(37, 99, 235, 0.1)",
        fill: true,
        tension: 0,
        pointRadius: 3,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }
        },
        y: {
          beginAtZero: false,
          ticks: { callback: (val) => val.toLocaleString() }
        }
      }
    }
  });
}

async function loadPlayerProfile(id) {
  if (!id) return;
  
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
  el("gainLabel").innerText = `30d ${scoreType} Gain`;
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
  el("errorState").style.display = "none";
  el("playerProfile").style.display = "none";
  el("emptyState").style.display = "block";
  el("playerSearch").value = "";
  el("playerSearch").focus();
}

async function init() {
  try {
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

    refreshAll();
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
    el("topGainers").innerText = "Loading...";
    const topGainers = await apiFetch("/top-gainers");
    renderTopGainers(topGainers);
  } catch (err) {
    el("topGainers").innerText = "Failed to load top gainers";
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

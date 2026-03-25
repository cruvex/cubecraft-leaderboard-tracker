const apiBase = '/api';

function el(id) { return document.getElementById(id); }

async function fetchTopGainers() {
  const res = await fetch(`${apiBase}/top-gainers`);
  if (!res.ok) throw new Error(`Failed to load top gainers (${res.status})`);
  return res.json();
}

async function fetchPlayerGain(uuid) {
  const res = await fetch(`${apiBase}/player/${encodeURIComponent(uuid)}/score_gain`);
  if (!res.ok) throw new Error(`Failed to load player gain (${res.status})`);
  return res.json();
}

async function fetchPlayerScores(uuid) {
  const res = await fetch(`${apiBase}/player/${encodeURIComponent(uuid)}/scores`);
  if (!res.ok) throw new Error(`Failed to load player scores (${res.status})`);
  return res.json();
}

function formatUuid(uuid) {
  // Keep short form for display if it's a long hex without dashes
  if (!uuid) return '';
  if (uuid.length === 32) return uuid.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  return uuid;
}

function renderTopGainers(container, data) {
  container.innerHTML = '';
  if (!Array.isArray(data) || data.length === 0) {
    container.innerText = 'No data';
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Player (UUID)</th><th>Score gain</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  data.forEach((row) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.title = 'Click to load this player';
    const displayUuid = formatUuid(row.player);
    tr.innerHTML = `<td>${displayUuid}</td><td>${row.score_gain}</td>`;
    tr.addEventListener('click', () => {
      el('playerUuid').value = row.player;
      // Optionally load profile gain and time series automatically
      loadPlayerGain(row.player);
      loadPlayerScores(row.player);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

let chart = null;

function renderTimeSeries(canvas, rows) {
  const labels = rows.map(r => new Date(r.timestamp).toLocaleString());
  const data = rows.map(r => Number(r.score));

  if (!window.Chart) {
    // Chart.js not loaded
    canvas.parentElement.innerHTML = '<div>Chart.js is not available. Ensure the CDN is loaded in index.html.</div>';
    return;
  }

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update();
    return;
  }

  const ctx = canvas.getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Score',
        data,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75,192,192,0.08)',
        tension: 0.2,
        fill: true,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        tooltip: {
          mode: 'index',
          intersect: false,
        },
        legend: {
          display: true
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      },
      scales: {
        x: {
          display: true,
          title: { display: true, text: 'Time' }
        },
        y: {
          display: true,
          title: { display: true, text: 'Score' },
          beginAtZero: false
        }
      }
    }
  });
}

async function loadTopGainers() {
  const container = el('topGainers');
  container.innerText = 'Loading...';
  try {
    const top = await fetchTopGainers();
    renderTopGainers(container, top);
  } catch (err) {
    container.innerText = 'Failed to load: ' + (err.message || err);
  }
}

async function loadPlayerGain(uuid) {
  const display = el('playerGain');
  if (!uuid) {
    display.innerText = 'Score gain: —';
    return;
  }
  display.innerText = 'Loading...';
  try {
    const res = await fetchPlayerGain(uuid);
    display.innerText = `Score gain (30d): ${res.score_gain}`;
  } catch (err) {
    display.innerText = 'Failed to load: ' + (err.message || err);
  }
}

async function loadPlayerScores(uuid) {
  const canvas = el('scoreChart');
  if (!uuid) {
    alert('Please enter a player UUID or select one from the top gainers');
    return;
  }

  try {
    const res = await fetchPlayerScores(uuid);
    if (!res.rows || res.rows.length === 0) {
      alert('No score history available for this player in the last 30 days.');
      // clear chart if exists
      if (chart) {
        chart.data.labels = [];
        chart.data.datasets[0].data = [];
        chart.update();
      }
      return;
    }
    renderTimeSeries(canvas, res.rows);
  } catch (err) {
    alert('Failed to load scores: ' + (err.message || err));
  }
}

// Wire up UI
(function init() {
  // Initial load of top gainers
  loadTopGainers();

  // Default player input value if present in DOM
  const defaultUuidInput = el('playerUuid');
  if (defaultUuidInput && defaultUuidInput.value.trim()) {
    // pre-load gain (but not time series to avoid unnecessary queries)
    loadPlayerGain(defaultUuidInput.value.trim());
  }

  const btnGain = el('loadPlayerGain');
  if (btnGain) {
    btnGain.addEventListener('click', async () => {
      const uuid = el('playerUuid').value.trim();
      await loadPlayerGain(uuid);
    });
  }

  const btnScores = el('loadPlayerScores');
  if (btnScores) {
    btnScores.addEventListener('click', async () => {
      const uuid = el('playerUuid').value.trim();
      await loadPlayerScores(uuid);
    });
  }
})();

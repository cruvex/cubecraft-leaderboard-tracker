// Concurrent players in the currently selected game.
//
// The series is a step function, not a sampled one: readings only appear when
// Cubepanion's number refreshes, so between two of them the earlier value still
// stood. Interpolating would draw a change that was never observed.
import { Chart } from "./register.js";
import { el, getStyle } from "../dom.js";
import { state, subscribe } from "../state.js";
import { apiFetch, endpoints } from "../api.js";

// Per timeframe: bucket width, and the x-axis tick spacing that goes with it.
const RANGES = {
  24: { bucketSeconds: 300, tickMs: 3 * 60 * 60 * 1000 },
  168: { bucketSeconds: 900, tickMs: 24 * 60 * 60 * 1000 },
  720: { bucketSeconds: 3600, tickMs: 5 * 24 * 60 * 60 * 1000 },
};

const DEFAULT_HOURS = 24;

// A reading older than this is not "now" any more; measured p95 gap is 70 min.
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

// Readings this many buckets apart mean reporting stopped: 2h at 24H, 24h at 30D.
const GAP_BUCKETS = 24;

let populationChart = null;

subscribe(["game", "populationHours"], loadGamePopulation);

export function destroyPopulationChart() {
  if (populationChart) {
    populationChart.destroy();
    populationChart = null;
  }
}

export async function loadGamePopulation() {
  const game = state.currentGame;
  if (!game) return;

  const loading = el("populationLoading");
  loading.style.display = "flex";

  try {
    const hours = state.populationHours;
    const { bucketSeconds } = RANGES[hours] || RANGES[DEFAULT_HOURS];
    const data = await apiFetch(endpoints.gamePopulation(game.id, hours, bucketSeconds));
    renderPopulation(data);
  } catch (err) {
    console.error("Failed to load game population", err);
    destroyPopulationChart();
    setStats(null);
    showMessage("Couldn't load player counts for this game.");
  } finally {
    loading.style.display = "none";
  }
}

function renderPopulation(data) {
  const hours = state.populationHours;
  const { bucketSeconds, tickMs } = RANGES[hours] || RANGES[DEFAULT_HOURS];

  setStats(data);
  destroyPopulationChart();

  if (!data.rows.length) {
    showMessage(emptyMessage(data));
    return;
  }
  showMessage(null);

  const now = Date.now();
  const minTime = now - hours * 60 * 60 * 1000;

  // A null y is what stops Chart.js bridging a hole in reporting.
  const gapMs = bucketSeconds * 1000 * GAP_BUCKETS;
  const chartData = [];
  let prevX = null;
  for (const row of data.rows) {
    const x = new Date(row.timestamp).getTime();
    if (prevX !== null && x - prevX > gapMs) {
      chartData.push({ x: prevX + 1, y: null });
    }
    chartData.push({ x, y: row.players });
    prevX = x;
  }

  const primary = getStyle("--primary");
  const textMuted = getStyle("--text-muted");
  const border = getStyle("--border");
  const text = getStyle("--text");
  const cardBg = getStyle("--card-bg");

  const isMobile = window.innerWidth <= 600;
  const isSmall = window.innerWidth <= 900;
  const timeOfDay = hours <= 48;

  populationChart = new Chart(el("populationChart").getContext("2d"), {
    type: "line",
    data: {
      datasets: [
        {
          label: "Players",
          data: chartData,
          borderColor: primary,
          backgroundColor: primary,
          stepped: "after",
          spanGaps: false,
          pointRadius: 0,
          pointHoverRadius: isMobile ? 4 : 5,
          clip: false,
          borderWidth: isMobile ? 1.5 : 2,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", axis: "x", intersect: false },
      layout: { padding: { left: isSmall ? 2 : 5, right: isSmall ? 2 : 5 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cardBg,
          titleColor: text,
          bodyColor: text,
          borderColor: border,
          borderWidth: 1,
          padding: isMobile ? 8 : 12,
          boxPadding: 4,
          usePointStyle: true,
          callbacks: {
            title: (items) => new Date(items[0].parsed.x).toLocaleString(),
            label: (context) => `${formatPlayers(context.parsed.y)} players`,
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          min: minTime,
          max: now,
          grid: { display: false },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            stepSize: tickMs,
            color: textMuted,
            font: isMobile ? { size: 10 } : undefined,
            callback: (val) =>
              timeOfDay
                ? new Date(val).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : new Date(val).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          },
        },
        y: {
          title: {
            display: !isMobile,
            text: "Players online",
            color: textMuted,
            font: { weight: "bold" },
          },
          beginAtZero: true,
          grid: { color: border },
          ticks: {
            precision: 0,
            color: textMuted,
            font: isMobile ? { size: 10 } : undefined,
            callback: (val) => val.toLocaleString(),
          },
        },
      },
    },
  });
}

function setStats(data) {
  const { latest, peak, average } = data || {};
  const age = latest ? Date.now() - new Date(latest.timestamp).getTime() : null;
  const stale = age === null || age > STALE_AFTER_MS;

  el("populationNowLabel").textContent = nowLabel(latest, age, stale);
  el("populationNow").textContent = latest ? formatPlayers(latest.players) : "—";

  el("populationPeak").textContent = peak == null ? "—" : formatPlayers(peak);
  el("populationAverage").textContent = average == null ? "—" : formatPlayers(average);
}

// Readings arrive minutes apart, so even a current one gets its age spelled out.
function nowLabel(latest, age, stale) {
  if (!latest) return "Now";
  if (stale) return `Last seen ${formatAge(age)} ago`;
  if (age < 60_000) return "Now";
  return `Now (${formatAge(age)} ago)`;
}

function emptyMessage(data) {
  const range = state.populationHours === 24 ? "24 hours" : `${state.populationHours / 24} days`;
  if (!data.latest) return "No player counts have been recorded for this game yet.";
  const age = Date.now() - new Date(data.latest.timestamp).getTime();
  return `No readings in the last ${range}. This game last reported ${formatAge(age)} ago.`;
}

function showMessage(message) {
  const empty = el("populationEmpty");
  empty.textContent = message || "";
  empty.style.display = message ? "flex" : "none";
}

// Only the window average arrives fractional, and a tenth of a player means
// nothing to the reader. The API keeps its precision; this is presentation.
function formatPlayers(value) {
  if (value == null) return "—";
  return Math.round(value).toLocaleString();
}

function formatAge(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function updatePopulationChartTheme() {
  if (!populationChart) return;

  const textMuted = getStyle("--text-muted");
  const border = getStyle("--border");
  const text = getStyle("--text");
  const cardBg = getStyle("--card-bg");

  populationChart.options.scales.x.ticks.color = textMuted;
  populationChart.options.scales.y.ticks.color = textMuted;
  populationChart.options.scales.y.grid.color = border;
  populationChart.options.scales.y.title.color = textMuted;

  populationChart.options.plugins.tooltip.backgroundColor = cardBg;
  populationChart.options.plugins.tooltip.titleColor = text;
  populationChart.options.plugins.tooltip.bodyColor = text;
  populationChart.options.plugins.tooltip.borderColor = border;

  populationChart.update("none");
}

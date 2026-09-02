// Total network population from the Java status ping: one sample a minute, so bucket averages are real.
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

// Samples land every 60s, so anything past this is an outage, not jitter.
const STALE_AFTER_MS = 10 * 60 * 1000;

let serverChart = null;

subscribe(["serverHours"], loadServerPopulation);

export function destroyServerPopulationChart() {
  if (serverChart) {
    serverChart.destroy();
    serverChart = null;
  }
}

export async function loadServerPopulation() {
  const loading = el("serverPopulationLoading");
  if (!loading) return;
  loading.style.display = "flex";

  try {
    const hours = state.serverHours;
    const { bucketSeconds } = RANGES[hours] || RANGES[DEFAULT_HOURS];
    const data = await apiFetch(endpoints.serverPopulation(hours, bucketSeconds));
    render(data);
  } catch (err) {
    console.error("Failed to load server population", err);
    destroyServerPopulationChart();
    setStats(null);
    showMessage("Couldn't load network player counts.");
  } finally {
    loading.style.display = "none";
  }
}

function render(data) {
  const hours = state.serverHours;
  const { bucketSeconds, tickMs } = RANGES[hours] || RANGES[DEFAULT_HOURS];

  setStats(data);
  destroyServerPopulationChart();

  if (!data.rows.length) {
    showMessage("No player counts have been recorded yet.");
    return;
  }
  showMessage(null);

  const now = Date.now();
  const minTime = now - hours * 60 * 60 * 1000;

  // Fixed grid, so a missing bucket is a failed poll; a null y stops Chart.js bridging it.
  const gapMs = bucketSeconds * 1000 * 1.5;
  const chartData = [];
  let prevX = null;
  for (const row of data.rows) {
    const x = new Date(row.timestamp).getTime();
    if (prevX !== null && x - prevX > gapMs) {
      chartData.push({ x: prevX + 1, y: null });
    }
    chartData.push({ x, y: row.online });
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

  serverChart = new Chart(el("serverPopulationChart").getContext("2d"), {
    type: "line",
    data: {
      datasets: [
        {
          label: "Players online",
          data: chartData,
          borderColor: primary,
          backgroundColor: primary + "22",
          fill: true,
          spanGaps: false,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: isMobile ? 4 : 5,
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

  el("serverNowLabel").textContent = nowLabel(latest, age, stale);
  el("serverNow").textContent = latest ? formatPlayers(latest.online) : "—";
  el("serverPeak").textContent = peak == null ? "—" : formatPlayers(peak);
  el("serverAverage").textContent = average == null ? "—" : formatPlayers(average);

  const capacity = latest?.capacity;
  el("serverCapacity").textContent =
    capacity && latest ? `${Math.round((latest.online / capacity) * 100)}%` : "—";
  el("serverCapacityLabel").textContent = capacity
    ? `of ${formatPlayers(capacity)} slots`
    : "Of capacity";
}

// A minute-resolution series is current or broken; no middle ground worth an age for.
function nowLabel(latest, age, stale) {
  if (!latest) return "Now";
  return stale ? `Last seen ${formatAge(age)} ago` : "Now";
}

function showMessage(message) {
  const empty = el("serverPopulationEmpty");
  empty.textContent = message || "";
  empty.style.display = message ? "flex" : "none";
}

// Bucket averages are fractional, but a tenth of a player is not worth showing.
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

export function updateServerPopulationChartTheme() {
  if (!serverChart) return;

  const textMuted = getStyle("--text-muted");
  const border = getStyle("--border");
  const text = getStyle("--text");
  const cardBg = getStyle("--card-bg");

  serverChart.options.scales.x.ticks.color = textMuted;
  serverChart.options.scales.y.ticks.color = textMuted;
  serverChart.options.scales.y.grid.color = border;
  serverChart.options.scales.y.title.color = textMuted;

  serverChart.options.plugins.tooltip.backgroundColor = cardBg;
  serverChart.options.plugins.tooltip.titleColor = text;
  serverChart.options.plugins.tooltip.bodyColor = text;
  serverChart.options.plugins.tooltip.borderColor = border;

  serverChart.update("none");
}

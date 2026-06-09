// "Wins over time" comparison chart: one line per player.
//
// Defaults to the top-10 gainers (state.comparisonPlayerIds === null) but is not
// bound to that concept — passing an explicit player list renders any selection.
// Timeframe and total/gained mode are independent of the global dashboard
// controls (see state.comparison*).
import { Chart } from "./register.js";
import { el, getStyle } from "../dom.js";
import { state } from "../state.js";
import { apiFetch, endpoints } from "../api.js";

const PLAYER_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
  "#0ea5e9", "#d946ef", "#eab308", "#f43f5e", "#06b6d4",
  "#a855f7", "#65a30d", "#db2777", "#ca8a04", "#15803d",
];

// Persistent ign->colour map so a player keeps the same colour while on the
// chart, regardless of add/remove order. Colours are released when a player
// leaves so the palette can be reused.
const colorAssignments = new Map();

/**
 * Assign/preserve a colour for each currently-shown player.
 * @param {string[]} igns players being drawn (in draw order)
 * @returns {Map<string, string>} lowercased-ign -> colour
 */
function assignColors(igns) {
  const present = new Set(igns.map((i) => i.toLowerCase()));

  // Release colours of players no longer shown.
  for (const key of [...colorAssignments.keys()]) {
    if (!present.has(key)) colorAssignments.delete(key);
  }

  // Assign the lowest unused palette colour to each new player.
  const used = new Set(colorAssignments.values());
  for (const ign of igns) {
    const key = ign.toLowerCase();
    if (colorAssignments.has(key)) continue;
    // First free palette colour; if we've exceeded the palette, cycle.
    const color =
      PLAYER_COLORS.find((c) => !used.has(c)) ??
      PLAYER_COLORS[colorAssignments.size % PLAYER_COLORS.length];
    colorAssignments.set(key, color);
    used.add(color);
  }

  return colorAssignments;
}

let comparisonChart = null;

export function destroyComparisonChart() {
  if (comparisonChart) {
    comparisonChart.destroy();
    comparisonChart = null;
  }
}

/**
 * Load the comparison chart for a set of players.
 * @param {string[] | null} playerIds UUIDs/IGNs to show. Falsy/empty falls back
 *   to the default top-gainers seed.
 */
export async function loadComparisonChart(playerIds = null) {
  // Explicitly-cleared selection ([]): nothing to fetch or draw.
  if (Array.isArray(playerIds) && playerIds.length === 0) {
    state.comparisonData = [];
    renderComparisonChart([]);
    return;
  }

  const loading = el("comparisonChartLoading");
  loading.style.display = "flex";

  try {
    const { currentGame, comparisonDays } = state;
    // null => default top-gainers seed; a non-empty list => explicit selection.
    const path =
      playerIds && playerIds.length
        ? endpoints.playersHistory(currentGame.id, playerIds, comparisonDays)
        : endpoints.topGainersHistory(currentGame.id, comparisonDays);

    state.comparisonData = (await apiFetch(path)) || [];
    renderComparisonChart(state.comparisonData);
  } catch (err) {
    console.error("Failed to load comparison chart", err);
    destroyComparisonChart();
  } finally {
    loading.style.display = "none";
  }
}

export function renderComparisonChart(players) {
  const ctx = el("comparisonChart").getContext("2d");

  destroyComparisonChart();

  const { comparisonDays, comparisonMode } = state;
  const now = Date.now();
  const maxTime = now;
  const minTime = now - comparisonDays * 24 * 60 * 60 * 1000;

  const scoreType = state.currentGame?.scoreType || "Wins";

  // Build each player's in-window series first, keeping only those with data.
  const withData = players
    .map((p) => {
      let data = p.rows
        .map((r) => ({ x: new Date(r.timestamp).getTime(), y: r.score }))
        .filter((d) => d.x >= minTime);
      // In "gained" mode, rebase each line to 0 at its earliest in-window point
      // so it shows wins accumulated within the timeframe. Rows arrive sorted
      // ascending by timestamp, so data[0] is the earliest.
      if (comparisonMode === "gained" && data.length) {
        const baseline = data[0].y;
        data = data.map((d) => ({ x: d.x, y: d.y - baseline }));
      }
      return { ign: p.ign, data };
    })
    .filter((d) => d.data.length);

  // Stable per-player colours, assigned to the players actually drawn.
  const colorByIgn = assignColors(withData.map((d) => d.ign));
  const datasets = withData.map((d) => ({
    ign: d.ign,
    color: colorByIgn.get(d.ign.toLowerCase()),
    data: d.data,
    // Toggled-off lines stay in the dataset (keeping their colour) but are hidden;
    // Chart.js also excludes hidden datasets from axis scaling.
    hidden: state.comparisonHidden?.has(d.ign.toLowerCase()) ?? false,
  }));

  // Publish the drawn ign→colour mapping so the selection pills can match the
  // lines, then let the selection module recolour its chips.
  state.comparisonSeries = datasets.map((d) => ({ ign: d.ign, color: d.color }));
  document.dispatchEvent(new CustomEvent("comparison:rendered"));

  if (!datasets.length) return;

  const textMuted = getStyle("--text-muted");
  const border = getStyle("--border");
  const text = getStyle("--text");
  const cardBg = getStyle("--card-bg");

  const isMobile = window.innerWidth <= 600;
  const isSmall = window.innerWidth <= 900;

  comparisonChart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: datasets.map((d) => ({
        label: d.ign,
        data: d.data,
        hidden: d.hidden,
        borderColor: d.color,
        backgroundColor: d.color,
        tension: 0,
        pointRadius: 0,
        pointHoverRadius: isMobile ? 4 : 5,
        pointBackgroundColor: d.color,
        clip: false,
        borderWidth: isMobile ? 1.5 : 2,
      })),
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", axis: "x", intersect: false },
      layout: {
        padding: {
          left: isSmall ? 2 : 5,
          right: isSmall ? 2 : 5,
        },
      },
      plugins: {
        legend: {
          // The selection pills act as the legend (colour + name), so the
          // chart's own legend is always off.
          display: false,
          position: "bottom",
          labels: {
            color: text,
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 8,
            boxHeight: 8,
            padding: isMobile ? 8 : 12,
            font: isMobile ? { size: 10 } : undefined,
            // Order the legend by each player's most recent value, highest first,
            // so it lines up with the chart top-to-bottom.
            sort: (a, b, chartData) => {
              const latestY = (i) => {
                const d = chartData.datasets[i].data;
                return d.length ? d[d.length - 1].y : -Infinity;
              };
              return latestY(b.datasetIndex) - latestY(a.datasetIndex);
            },
          },
        },
        tooltip: {
          backgroundColor: cardBg,
          titleColor: text,
          bodyColor: text,
          borderColor: border,
          borderWidth: 1,
          padding: isMobile ? 8 : 12,
          boxPadding: 4,
          usePointStyle: true,
          // Sort entries highest-first so tooltip order matches the lines.
          itemSort: (a, b) => b.parsed.y - a.parsed.y,
          callbacks: {
            title: (tooltipItems) => new Date(tooltipItems[0].parsed.x).toLocaleString(),
            label: (context) => {
              let label = context.dataset.label || "";
              if (label) label += ": ";
              if (context.parsed.y !== null) {
                const sign = comparisonMode === "gained" && context.parsed.y > 0 ? "+" : "";
                label += sign + context.parsed.y.toLocaleString();
              }
              return label;
            },
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          min: minTime,
          max: maxTime,
          grid: { display: false },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            stepSize: 24 * 60 * 60 * 1000,
            color: textMuted,
            font: isMobile ? { size: 10 } : undefined,
            callback: (val) =>
              new Date(val).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          },
        },
        y: {
          title: {
            display: !isMobile,
            text: comparisonMode === "gained" ? `${scoreType} gained` : `total ${scoreType}`,
            color: textMuted,
            font: { weight: "bold" },
          },
          beginAtZero: false,
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

// Alpha suffix (8-digit hex) applied to lines that are NOT the highlighted one.
const DIM_ALPHA = "26"; // ~15%

/**
 * Emphasise one player's line by dimming all the others. Pass null to clear.
 * @param {string | null} ign
 */
export function highlightComparisonLine(ign) {
  if (!comparisonChart) return;
  const key = ign ? ign.toLowerCase() : null;

  comparisonChart.data.datasets.forEach((ds) => {
    // Recompute from the persistent colour map so dimming never compounds.
    const base = colorAssignments.get(ds.label.toLowerCase()) || ds.borderColor;
    const dim = key !== null && ds.label.toLowerCase() !== key;
    const color = dim ? base + DIM_ALPHA : base;
    ds.borderColor = color;
    ds.backgroundColor = color;
  });

  comparisonChart.update("none");
}

export function updateComparisonChartTheme() {
  if (!comparisonChart) return;

  const textMuted = getStyle("--text-muted");
  const border = getStyle("--border");
  const text = getStyle("--text");
  const cardBg = getStyle("--card-bg");

  comparisonChart.options.scales.x.ticks.color = textMuted;
  comparisonChart.options.scales.y.ticks.color = textMuted;
  comparisonChart.options.scales.y.grid.color = border;
  comparisonChart.options.scales.y.title.color = textMuted;

  comparisonChart.options.plugins.legend.labels.color = text;

  comparisonChart.options.plugins.tooltip.backgroundColor = cardBg;
  comparisonChart.options.plugins.tooltip.titleColor = text;
  comparisonChart.options.plugins.tooltip.bodyColor = text;
  comparisonChart.options.plugins.tooltip.borderColor = border;

  comparisonChart.update("none");
}

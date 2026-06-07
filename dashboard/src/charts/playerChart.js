// Single-player score-over-time line chart (player profile).
import { Chart } from "./register.js";
import { el, getStyle } from "../dom.js";
import { state } from "../state.js";

let playerChart = null;

export function destroyPlayerChart() {
  if (playerChart) {
    playerChart.destroy();
    playerChart = null;
  }
}

export function renderPlayerChart(rows, scoreType = "Score") {
  const ctx = el("scoreChart").getContext("2d");

  const { displayMode, currentDays } = state;
  const now = Date.now();
  const maxTime = now;
  const minTime = now - currentDays * 24 * 60 * 60 * 1000;

  const chartData = rows
    .map((r) => ({
      x: new Date(r.timestamp).getTime(),
      y: displayMode === "wins" ? r.score : r.position,
    }))
    .filter((d) => d.x >= minTime);

  destroyPlayerChart();

  if (!chartData.length) return;

  const minVal = Math.min(...chartData.map((d) => d.y));
  const maxVal = Math.max(...chartData.map((d) => d.y));
  const padding = maxVal === minVal ? 1 : Math.max(1, Math.ceil((maxVal - minVal) * 0.1));

  const primary = getStyle("--primary");
  const textMuted = getStyle("--text-muted");
  const border = getStyle("--border");
  const text = getStyle("--text");
  const cardBg = getStyle("--card-bg");

  const label = displayMode === "wins" ? scoreType : "Position";

  const isMobile = window.innerWidth <= 600;
  const isSmall = window.innerWidth <= 900;

  playerChart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: label,
          data: chartData,
          borderColor: primary,
          backgroundColor: `${primary}1a`,
          tension: 0,
          pointRadius: 3,
          pointHoverRadius: isMobile ? 4 : 6,
          pointBackgroundColor: primary,
          clip: false,
          borderWidth: isMobile ? 2 : 3,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          left: isSmall ? 2 : 5,
          right: isSmall ? 2 : 5,
        },
      },
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
          mode: "index",
          intersect: false,
          callbacks: {
            title: (tooltipItems) => {
              const date = new Date(tooltipItems[0].parsed.x);
              return date.toLocaleString();
            },
            label: (context) => {
              let lbl = context.dataset.label || "";
              if (lbl) lbl += ": ";
              if (context.parsed.y !== null) lbl += context.parsed.y.toLocaleString();
              return lbl;
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
            text: label,
            color: textMuted,
            font: { weight: "bold" },
          },
          reverse: displayMode === "position",
          beginAtZero: false,
          suggestedMin: minVal - padding,
          suggestedMax: maxVal + padding,
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

export function updatePlayerChartTheme() {
  if (!playerChart) return;

  const textMuted = getStyle("--text-muted");
  const border = getStyle("--border");
  const text = getStyle("--text");
  const cardBg = getStyle("--card-bg");

  playerChart.options.scales.x.ticks.color = textMuted;
  playerChart.options.scales.y.ticks.color = textMuted;
  playerChart.options.scales.y.grid.color = border;
  playerChart.options.scales.y.title.color = textMuted;

  playerChart.options.plugins.tooltip.backgroundColor = cardBg;
  playerChart.options.plugins.tooltip.titleColor = text;
  playerChart.options.plugins.tooltip.bodyColor = text;
  playerChart.options.plugins.tooltip.borderColor = border;

  playerChart.update("none");
}

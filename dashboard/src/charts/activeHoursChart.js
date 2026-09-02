// Average players by hour of day — the daily cycle the raw series is too dense to read.
import { Chart } from "./register.js";
import { el, getStyle } from "../dom.js";
import { apiFetch, endpoints } from "../api.js";

// Hours are bucketed server-side in this zone, so "8pm" means the reader's 8pm.
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const WINDOW_DAYS = 30;

let activeHoursChart = null;

export function destroyActiveHoursChart() {
  if (activeHoursChart) {
    activeHoursChart.destroy();
    activeHoursChart = null;
  }
}

export async function loadActiveHours() {
  const loading = el("activeHoursLoading");
  if (!loading) return;
  loading.style.display = "flex";

  try {
    render(await apiFetch(endpoints.serverActiveHours(WINDOW_DAYS, TIME_ZONE)));
  } catch (err) {
    console.error("Failed to load active hours", err);
    destroyActiveHoursChart();
    showMessage("Couldn't load the hourly breakdown.");
  } finally {
    loading.style.display = "none";
  }
}

function render(data) {
  destroyActiveHoursChart();

  const hours = data.hours;
  if (!hours.some((h) => h.average != null)) {
    el("activeHoursDescription").textContent = "Average players online by hour of day.";
    showMessage("No player counts recorded in this window.");
    return;
  }
  showMessage(null);

  const busiest = hours.reduce((a, b) => ((b.average ?? -1) > (a.average ?? -1) ? b : a));
  el("activeHoursDescription").textContent =
    `Average players online by hour of day over the last ${data.days} days, in your local time ` +
    `(${data.timeZone}). Busiest around ${formatHour(busiest.hour)}.`;

  const primary = getStyle("--primary");
  const textMuted = getStyle("--text-muted");
  const border = getStyle("--border");
  const text = getStyle("--text");
  const cardBg = getStyle("--card-bg");
  const isMobile = window.innerWidth <= 600;

  activeHoursChart = new Chart(el("activeHoursChart").getContext("2d"), {
    type: "bar",
    data: {
      labels: hours.map((h) => formatHour(h.hour)),
      datasets: [
        {
          label: "Average players",
          data: hours.map((h) => h.average),
          // The peak hour carries the answer, so it is the one bar at full strength.
          backgroundColor: hours.map((h) => (h.hour === busiest.hour ? primary : primary + "55")),
          borderRadius: 4,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cardBg,
          titleColor: text,
          bodyColor: text,
          borderColor: border,
          borderWidth: 1,
          padding: isMobile ? 8 : 12,
          callbacks: {
            label: (ctx) => {
              const row = hours[ctx.dataIndex];
              return [
                `${formatPlayers(row.average)} players on average`,
                `Peak ${formatPlayers(row.peak)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            color: textMuted,
            font: isMobile ? { size: 9 } : undefined,
          },
        },
        y: {
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

function showMessage(message) {
  const empty = el("activeHoursEmpty");
  empty.textContent = message || "";
  empty.style.display = message ? "flex" : "none";
}

function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatPlayers(value) {
  if (value == null) return "—";
  return Math.round(value).toLocaleString();
}

export function updateActiveHoursChartTheme() {
  if (!activeHoursChart) return;

  const textMuted = getStyle("--text-muted");
  const border = getStyle("--border");
  const text = getStyle("--text");
  const cardBg = getStyle("--card-bg");

  activeHoursChart.options.scales.x.ticks.color = textMuted;
  activeHoursChart.options.scales.y.ticks.color = textMuted;
  activeHoursChart.options.scales.y.grid.color = border;

  activeHoursChart.options.plugins.tooltip.backgroundColor = cardBg;
  activeHoursChart.options.plugins.tooltip.titleColor = text;
  activeHoursChart.options.plugins.tooltip.bodyColor = text;
  activeHoursChart.options.plugins.tooltip.borderColor = border;

  activeHoursChart.update("none");
}

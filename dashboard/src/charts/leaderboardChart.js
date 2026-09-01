// Full leaderboard: horizontal bar chart with rank-change annotations.
import { Chart } from "./register.js";
import { el, getStyle } from "../dom.js";
import { state, subscribe } from "../state.js";
import { apiFetch, endpoints } from "../api.js";
import { loadPlayerProfile, scrollToPlayerProfile } from "../playerProfile.js";

let leaderboardChart = null;

subscribe(["game", "days"], loadLeaderboard);

export async function loadLeaderboard() {
  el("leaderboardLoading").style.display = "flex";
  try {
    const leaderboard = await apiFetch(
      endpoints.leaderboard(state.currentGame.id, state.currentDays)
    );
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

  const scoreType = state.currentGame?.scoreType || "Score";
  const gameDisplayName = state.currentGame?.displayName || "Full";

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
    const newPlayers = data.rows.filter((r) => r.isNew);
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

      let activityHtml = "";

      if (newPlayers.length > 0) {
        newPlayers.forEach((p) => {
          activityHtml += `
              <div class="activity-feed-item activity-joined">
                <div class="activity-icon"></div>
                <span><span class="activity-player">${p.ign}</span> entered the leaderboard</span>
              </div>`;
        });
      }

      if (leftPlayers.length > 0) {
        leftPlayers.forEach((p) => {
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

  const values = rows.map((d) => d.score);
  const max = Math.max(...values);

  const primary = getStyle("--primary");
  const textMuted = getStyle("--text-muted");
  const border = getStyle("--border");
  const text = getStyle("--text");
  const cardBg = getStyle("--card-bg");

  const isMobile = window.innerWidth <= 700;

  leaderboardChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: rows.map((d, i) => (isMobile ? `${i + 1}` : `${i + 1}. ${d.ign}`)),
      datasets: [
        {
          label: scoreType,
          data: rows.map((d) => d.score),
          backgroundColor: `${primary}b3`,
          borderColor: primary,
          borderWidth: 0,
          borderRadius: 5,
          hoverBackgroundColor: "#2563eb",
          xAxisID: "xBottom",
          barThickness: isMobile ? 12 : undefined,
        },
      ],
    },
    plugins: [
      {
        id: "customLabels",
        afterDraw: (chart) => {
          const {
            ctx: c,
            scales: { y },
            chartArea,
          } = chart;
          c.save();

          if (isMobile) {
            c.font = "bold 10px Inter, system-ui, sans-serif";
            c.textBaseline = "bottom";
            c.textAlign = "left";
            c.fillStyle = text;

            rows.forEach((row, index) => {
              const yCenter = y.getPixelForValue(index);
              const yText = yCenter - 8;

              let rankText = "";
              let rankColor = "";
              if (row.isNew) {
                rankText = "NEW";
                rankColor = "#3b82f6";
              } else if (row.rankChange !== null && row.rankChange !== 0) {
                rankText = (row.rankChange > 0 ? "+" : "") + row.rankChange;
                rankColor = row.rankChange > 0 ? "#10b981" : "#ef4444";
              }

              let xIgn = chartArea.left;
              if (rankText) {
                c.fillStyle = rankColor;
                c.textAlign = "left";
                c.fillText(rankText, chartArea.left, yText);
                xIgn += c.measureText(rankText).width + 4;
              }

              c.fillStyle = text;
              c.textAlign = "left";
              c.fillText(row.ign, xIgn, yText);
            });
          } else {
            const ticks = y.getTicks();
            c.font = "bold 12px sans-serif";
            c.textAlign = "right";
            c.textBaseline = "middle";

            ticks.forEach((tick, index) => {
              const row = rows[index];
              if (!row) return;
              let rankText = "";
              let color = "";
              if (row.isNew) {
                rankText = "NEW";
                color = "#3b82f6";
              } else if (row.rankChange !== null && row.rankChange !== 0) {
                rankText = (row.rankChange > 0 ? "+" : "") + row.rankChange;
                color = row.rankChange > 0 ? "#10b981" : "#ef4444";
              }
              if (rankText) {
                c.fillStyle = color;
                c.fillText(rankText, y.right - 5, y.getPixelForTick(index));
              }
            });
          }

          c.restore();
        },
      },
    ],
    options: {
      indexAxis: "y",
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
          padding: isMobile ? 8 : 12,
          boxPadding: 4,
          usePointStyle: true,
          callbacks: {
            label: (context) => {
              const d = rows[context.dataIndex];
              let label = `${scoreType}: ${context.parsed.x.toLocaleString()}`;
              if (d.isNew) {
                label += " (New Entry)";
              } else if (d.rankChange !== null && d.rankChange !== 0) {
                label += ` (Position Change: ${d.rankChange > 0 ? "+" : ""}${d.rankChange})`;
              }
              return label;
            },
            title: (items) => (isMobile ? rows[items[0].dataIndex]?.ign : undefined),
          },
        },
      },
      scales: {
        xTop: {
          type: "linear",
          position: "top",
          max,
          beginAtZero: true,
          title: {
            display: !isMobile,
            text: `total ${scoreType}`,
            color: textMuted,
            font: { weight: "bold" },
          },
          grid: { color: border },
          ticks: {
            color: textMuted,
            font: isMobile ? { size: 10 } : undefined,
            callback: (val) => val.toLocaleString(),
          },
        },
        xBottom: {
          type: "linear",
          position: "bottom",
          max,
          beginAtZero: true,
          title: {
            display: !isMobile,
            text: `total ${scoreType}`,
            color: textMuted,
            font: { weight: "bold" },
          },
          grid: { drawOnChartArea: false, color: border },
          ticks: {
            color: textMuted,
            font: isMobile ? { size: 10 } : undefined,
            callback: (val) => val.toLocaleString(),
          },
        },
        y: {
          grid: { display: false, drawBorder: false },
          ticks: {
            autoSkip: false,
            padding: isMobile ? 4 : 15,
            crossAlign: "far",
            color: textMuted,
            font: { size: isMobile ? 10 : 12 },
          },
        },
      },
      onClick: (e, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const player = rows[index];
          loadPlayerProfile(player.player);
          scrollToPlayerProfile();
        }
      },
    },
  });

  // Dynamically adjust height based on number of players
  const chartHeight = Math.max(400, rows.length * (isMobile ? 32 : 25));
  el("leaderboardChart").parentElement.style.height = `${chartHeight}px`;
}

export function updateLeaderboardChartTheme() {
  if (!leaderboardChart) return;

  const primary = getStyle("--primary");
  const textMuted = getStyle("--text-muted");
  const border = getStyle("--border");
  const text = getStyle("--text");
  const cardBg = getStyle("--card-bg");

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

  leaderboardChart.update("none");
}

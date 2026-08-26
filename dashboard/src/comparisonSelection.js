// Player selection for the "wins over time" comparison chart.
//
// state.comparisonPlayers is tri-state:
//   null  -> default: show the top gainers (rendered as chips)
//   []    -> explicitly cleared: show nothing
//   [..]  -> custom: the listed { uuid, ign } pairs
// Search reuses the existing /search/players endpoint (returns { uuid, ign }).
import { el } from "./dom.js";
import { state } from "./state.js";
import { apiFetch, endpoints } from "./api.js";
import {
  loadComparisonChart,
  appendComparisonPlayer,
  renderComparisonChart,
  highlightComparisonLine,
} from "./charts/comparisonChart.js";
import { saveComparisonState } from "./comparisonStore.js";

let autocompleteIndex = -1;

/** The players currently shown: the drawn series in default mode, else the list. */
function currentPlayers() {
  if (state.comparisonPlayers !== null) return state.comparisonPlayers;
  // Default mode: derive { uuid, ign } from the drawn series, picking the UUIDs
  // out of the fetched data so a selection seeded from the default carries them.
  // Every drawn series comes from comparisonData, so the lookup always hits.
  const uuidByIgn = new Map(
    (state.comparisonData || []).map((p) => [p.ign.toLowerCase(), p.player])
  );
  return (state.comparisonSeries || []).map((s) => ({
    uuid: uuidByIgn.get(s.ign.toLowerCase()),
    ign: s.ign,
  }));
}

/** @param {{ uuid: string | null, ign: string }} player uuid is null for ign-only checks */
function isSelected(player) {
  return currentPlayers().some(
    (p) =>
      (player.uuid != null && p.uuid === player.uuid) ||
      p.ign.toLowerCase() === player.ign.toLowerCase()
  );
}

/** Apply a new selection and reload the chart. */
function setSelection(players) {
  state.comparisonPlayers = players;
  saveComparisonState();
  renderSelection();
  loadComparisonChart(players);
}

/** @param {{ uuid: string, ign: string }} player */
function addPlayer(player) {
  if (!player?.ign || isSelected(player)) return;
  // Adding from the default view keeps the current top gainers and appends.
  state.comparisonPlayers = [...currentPlayers(), player];
  saveComparisonState();
  renderSelection();
  // No full refetch: only the new player is fetched and merged into the cache.
  appendComparisonPlayer(player);
}

/**
 * Public entry point for "add to comparison" buttons elsewhere (top gainers,
 * player profile). Returns true if the player was newly added, false if they
 * were already shown.
 * @param {{ uuid: string, ign: string }} player
 */
export function addToComparison(player) {
  if (!player?.ign || isSelected(player)) return false;
  addPlayer(player);
  return true;
}

/** True if the player is already on the comparison chart. */
export function isInComparison(ign) {
  return !!ign && isSelected({ uuid: null, ign });
}

function removePlayer(ign) {
  state.comparisonPlayers = currentPlayers().filter(
    (p) => p.ign.toLowerCase() !== ign.toLowerCase()
  );
  state.comparisonHidden.delete(ign.toLowerCase());
  saveComparisonState();
  // No refetch: the removed player is a subset of what's already loaded, so just
  // drop it from the cached series and re-render. The chart fires
  // "comparison:rendered", which refreshes the chips and buttons.
  state.comparisonData = (state.comparisonData || []).filter(
    (p) => p.ign.toLowerCase() !== ign.toLowerCase()
  );
  renderComparisonChart(state.comparisonData);
}

/** Toggle a player's line on/off without removing them from the selection. */
function toggleVisibility(ign) {
  const key = ign.toLowerCase();
  if (state.comparisonHidden.has(key)) state.comparisonHidden.delete(key);
  else state.comparisonHidden.add(key);
  // Re-render from cache; "comparison:rendered" refreshes the chip styling.
  renderComparisonChart(state.comparisonData);
}

function resetSelection() {
  if (state.comparisonPlayers === null) return;
  state.comparisonHidden.clear();
  setSelection(null);
}

function clearAll() {
  state.comparisonHidden.clear();
  setSelection([]);
}

/** Render the chips, action buttons and default-hint for the current selection. */
export function renderSelection() {
  const container = el("comparisonChips");
  const resetBtn = el("comparisonResetBtn");
  const clearBtn = el("comparisonClearBtn");
  const emptyEl = el("comparisonEmpty");

  const isDefault = state.comparisonPlayers === null;
  const chipIgns = currentPlayers().map((p) => p.ign);

  resetBtn.hidden = isDefault; // only meaningful once you've diverged from default
  clearBtn.hidden = chipIgns.length === 0;
  if (emptyEl) emptyEl.style.display = !isDefault && chipIgns.length === 0 ? "flex" : "none";

  // Colour each chip to match its line. Look up by IGN from the series the chart
  // actually drew; a player with no data in the window has no line, so it gets a
  // muted dot and a hint.
  const colorByIgn = new Map(
    (state.comparisonSeries || []).map((s) => [s.ign.toLowerCase(), s.color])
  );

  // Sort chips by total wins at the most recent snapshot (last cached row),
  // highest first. Players with no data sort to the end (stable order).
  const latestScoreByIgn = new Map(
    (state.comparisonData || []).map((p) => {
      const last = p.rows[p.rows.length - 1];
      return [p.ign.toLowerCase(), last ? last.score : -Infinity];
    })
  );
  const sortedIgns = [...chipIgns].sort(
    (a, b) =>
      (latestScoreByIgn.get(b.toLowerCase()) ?? -Infinity) -
      (latestScoreByIgn.get(a.toLowerCase()) ?? -Infinity)
  );

  container.innerHTML = "";
  sortedIgns.forEach((ign) => {
    const chip = document.createElement("span");
    chip.className = "player-chip";

    const color = colorByIgn.get(ign.toLowerCase());
    const hidden = state.comparisonHidden.has(ign.toLowerCase());
    const dot = document.createElement("span");
    dot.className = "player-chip-dot";
    if (color) {
      dot.style.background = color;
      // Only players with a line can be toggled on/off.
      chip.classList.add("player-chip--toggleable");
      if (hidden) chip.classList.add("player-chip--hidden");
      chip.title = hidden ? "Show on chart" : "Hide from chart";
      chip.onclick = () => toggleVisibility(ign);
      // Hover a visible chip to emphasise its line (dim the others).
      if (!hidden) {
        chip.addEventListener("mouseenter", () => highlightComparisonLine(ign));
        chip.addEventListener("mouseleave", () => highlightComparisonLine(null));
      }
    } else {
      chip.classList.add("player-chip--nodata");
      chip.title = "No data in this timeframe";
    }
    chip.appendChild(dot);

    const label = document.createElement("span");
    label.className = "player-chip-label";
    label.textContent = ign;
    chip.appendChild(label);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "player-chip-remove";
    btn.setAttribute("aria-label", `Remove ${ign}`);
    btn.textContent = "×"; // ×
    btn.onclick = (e) => {
      e.stopPropagation(); // don't trigger the chip's toggle
      removePlayer(ign);
    };
    chip.appendChild(btn);

    container.appendChild(chip);
  });
}

// The { uuid, ign } items currently shown in the dropdown, by list position,
// so keyboard selection can recover the full player from the highlight index.
let dropdownItems = [];

function showDropdown(items) {
  const dropdown = el("comparisonSearchDropdown");
  dropdown.innerHTML = "";
  autocompleteIndex = -1;

  // Hide players already in the selection.
  dropdownItems = items.filter((player) => !isSelected(player));
  if (!dropdownItems.length) {
    dropdown.hidden = true;
    return;
  }

  dropdownItems.forEach((player) => {
    const li = document.createElement("li");
    li.textContent = player.ign;
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      el("comparisonSearch").value = "";
      hideDropdown();
      addPlayer(player);
    });
    dropdown.appendChild(li);
  });
  dropdown.hidden = false;
}

function hideDropdown() {
  el("comparisonSearchDropdown").hidden = true;
  autocompleteIndex = -1;
}

function updateHighlight() {
  const items = el("comparisonSearchDropdown").querySelectorAll("li");
  items.forEach((li, i) => li.classList.toggle("active", i === autocompleteIndex));
}

/** Wire up the add-player search box and reset button. */
export function setupComparisonSelection() {
  let autocompleteTimeout = null;
  const input = el("comparisonSearch");

  input.addEventListener("input", () => {
    clearTimeout(autocompleteTimeout);
    const q = input.value.trim();
    if (q.length < 2) {
      hideDropdown();
      return;
    }
    autocompleteTimeout = setTimeout(async () => {
      try {
        const data = await apiFetch(endpoints.searchPlayers(q));
        showDropdown(data);
      } catch {}
    }, 250);
  });

  input.addEventListener("keydown", (e) => {
    const dropdown = el("comparisonSearchDropdown");
    if (dropdown.hidden) return;
    const items = dropdown.querySelectorAll("li");
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      autocompleteIndex = Math.min(autocompleteIndex + 1, items.length - 1);
      updateHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      autocompleteIndex = Math.max(autocompleteIndex - 1, -1);
      updateHighlight();
    } else if (e.key === "Escape") {
      hideDropdown();
    }
  });

  input.onkeyup = (e) => {
    if (e.key !== "Enter") return;
    const dropdown = el("comparisonSearchDropdown");
    if (!dropdown.hidden && autocompleteIndex >= 0 && dropdownItems[autocompleteIndex]) {
      const player = dropdownItems[autocompleteIndex];
      input.value = "";
      hideDropdown();
      addPlayer(player);
    }
  };

  input.addEventListener("blur", () => setTimeout(hideDropdown, 150));

  el("comparisonResetBtn").onclick = resetSelection;
  el("comparisonClearBtn").onclick = clearAll;

  // Recolour chips whenever the chart (re)renders, so dot colours stay in sync
  // with the lines after loads, timeframe/mode changes, etc.
  document.addEventListener("comparison:rendered", renderSelection);

  renderSelection();
}

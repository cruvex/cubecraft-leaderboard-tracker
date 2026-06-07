// Player search box + autocomplete dropdown.
import { el } from "./dom.js";
import { state } from "./state.js";
import { apiFetch, endpoints } from "./api.js";
import { updatePath } from "./router.js";
import { loadPlayerProfile } from "./playerProfile.js";

function showDropdown(items) {
  const dropdown = el("playerSearchDropdown");
  dropdown.innerHTML = "";
  state.autocompleteSelectedIndex = -1;
  if (!items.length) {
    dropdown.hidden = true;
    return;
  }
  items.forEach((ign) => {
    const li = document.createElement("li");
    li.textContent = ign;
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      el("playerSearch").value = ign;
      dropdown.hidden = true;
      state.autocompleteSelectedIndex = -1;
      loadPlayerProfile(ign);
    });
    dropdown.appendChild(li);
  });
  dropdown.hidden = false;
}

function hideDropdown() {
  el("playerSearchDropdown").hidden = true;
  state.autocompleteSelectedIndex = -1;
}

function updateDropdownHighlight() {
  const items = el("playerSearchDropdown").querySelectorAll("li");
  items.forEach((li, i) => li.classList.toggle("active", i === state.autocompleteSelectedIndex));
}

/** Currently unused, kept for the reset-to-empty flow. */
export function resetSearch() {
  updatePath();
  hideDropdown();

  el("errorState").style.display = "none";
  el("playerProfile").style.display = "none";
  el("emptyState").style.display = "block";
  el("playerSearch").value = "";
  el("playerSearch").focus();
}

/** Wire up the search input, button, autocomplete and keyboard navigation. */
export function setupSearch() {
  let autocompleteTimeout = null;

  el("loadPlayerBtn").onclick = () => {
    const query = el("playerSearch").value.trim();
    if (query) {
      hideDropdown();
      loadPlayerProfile(query);
    }
  };

  el("playerSearch").onkeyup = (e) => {
    if (e.key === "Enter") {
      const dropdown = el("playerSearchDropdown");
      const items = dropdown.querySelectorAll("li");
      const idx = state.autocompleteSelectedIndex;
      if (!dropdown.hidden && idx >= 0 && items[idx]) {
        const ign = items[idx].textContent;
        el("playerSearch").value = ign;
        hideDropdown();
        loadPlayerProfile(ign);
      } else {
        const query = el("playerSearch").value.trim();
        if (query) {
          hideDropdown();
          loadPlayerProfile(query);
        }
      }
    }
  };

  el("playerSearch").addEventListener("input", () => {
    clearTimeout(autocompleteTimeout);
    const q = el("playerSearch").value.trim();
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

  el("playerSearch").addEventListener("keydown", (e) => {
    const dropdown = el("playerSearchDropdown");
    if (dropdown.hidden) return;
    const items = dropdown.querySelectorAll("li");
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      state.autocompleteSelectedIndex = Math.min(
        state.autocompleteSelectedIndex + 1,
        items.length - 1
      );
      updateDropdownHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      state.autocompleteSelectedIndex = Math.max(state.autocompleteSelectedIndex - 1, -1);
      updateDropdownHighlight();
    } else if (e.key === "Escape") {
      hideDropdown();
    }
  });

  el("playerSearch").addEventListener("blur", () => {
    setTimeout(hideDropdown, 150);
  });
}

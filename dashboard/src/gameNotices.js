// Warning cards for a single game: markup opts in with data-game="<game name>".
import { state, subscribe } from "./state.js";
import { el } from "./dom.js";

subscribe(["game"], () => {
  for (const card of document.querySelectorAll(".warning-card[data-game]")) {
    card.hidden = card.dataset.game !== state.currentGame?.name;
  }
  const game = state.currentGame;
  const inactive = game?.active === false;
  el("inactiveNotice").hidden = !inactive;
  if (inactive) el("inactiveNoticeDate").textContent = new Date(game.lastSnapshot).toLocaleDateString();
});

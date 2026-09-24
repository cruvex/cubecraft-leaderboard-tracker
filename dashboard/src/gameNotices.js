// Warning cards for a single game: markup opts in with data-game="<game name>".
import { state, subscribe } from "./state.js";

subscribe(["game"], () => {
  for (const card of document.querySelectorAll(".warning-card[data-game]")) {
    card.hidden = card.dataset.game !== state.currentGame?.name;
  }
});

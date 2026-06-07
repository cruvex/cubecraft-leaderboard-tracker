// URL <-> app-state syncing. Path shape: /games/:gameName/player/:ign
import { state } from "./state.js";

/**
 * Parse the initial URL. Returns `{ gameName, playerIgn }` (either may be null),
 * or `{ redirect: true }` when the path is malformed and the caller should
 * send the user back to "/".
 */
export function parseInitialPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  let gameName = null;
  let playerIgn = null;

  if (parts.length > 0) {
    if (parts[0] === "games" && parts.length >= 2) {
      gameName = parts[1];
      if (parts[2] === "player" && parts.length >= 4) {
        playerIgn = parts[3];
      } else if (parts.length > 2) {
        return { redirect: true };
      }
    } else {
      return { redirect: true };
    }
  }
  return { gameName, playerIgn };
}

/** Reflect the current game/player into the address bar without navigating. */
export function updatePath() {
  const { currentGame, currentPlayer } = state;
  if (!currentGame) return;

  let newPath = `/games/${currentGame.name}`;
  if (currentPlayer && currentPlayer.ign) {
    newPath += `/player/${currentPlayer.ign}`;
  }
  window.history.replaceState({}, "", newPath);
}

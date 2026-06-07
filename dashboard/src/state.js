// Shared mutable app state. A single object so other modules can read and
// mutate fields (ES module `let` exports are read-only across modules).
export const state = {
  /** @type {any[]} */
  games: [],
  /** @type {any} */
  currentGame: undefined,
  currentDays: 30,
  /** "wins" | "position" */
  displayMode: "wins",
  /** @type {{ id: string, ign: string, data: any } | undefined} */
  currentPlayer: undefined,

  // --- Search autocomplete ---
  autocompleteSelectedIndex: -1,
};

export const enabledGames = ["team_eggwars", "solo_skywars", "free_for_all"];

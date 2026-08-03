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

  // --- "Wins over time" comparison chart (independent of the global controls) ---
  /**
   * Players shown in the comparison chart. `null` means "use the default"
   * (top gainers); a list means a custom selection. Each entry carries the
   * UUID (what the API is queried by, so the server never has to resolve an
   * ign→uuid) and the IGN (for the chips).
   * @type {{ uuid: string, ign: string }[] | null}
   */
  comparisonPlayers: null,
  /** Timeframe (in days) for the comparison chart, independent of the global toggle. */
  comparisonDays: 30,
  /** "total" = absolute score; "gained" = rebased to 0 at each player's earliest in-window point. */
  comparisonMode: "total",
  /** Last-fetched comparison series, cached so the mode toggle can re-render without refetching. */
  comparisonData: [],
  /**
   * The ign→colour mapping of the lines actually drawn, published by the chart
   * so the selection pills can match line colours.
   * @type {{ ign: string, color: string }[]}
   */
  comparisonSeries: [],
  /**
   * Lowercased IGNs whose lines are toggled off (hidden but still selected).
   * Transient view state — not persisted.
   * @type {Set<string>}
   */
  comparisonHidden: new Set(),

  // --- Search autocomplete ---
  autocompleteSelectedIndex: -1,
};

export const enabledGames = ["team_eggwars", "solo_skywars", "free_for_all"];

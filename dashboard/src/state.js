// Shared mutable app state; one object because ES module `let` exports are read-only across modules.
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
  /** `null` means the default (top gainers); uuid is what the API is queried by. @type {{ uuid: string, ign: string }[] | null} */
  comparisonPlayers: null,
  /** Timeframe (in days) for the comparison chart, independent of the global toggle. */
  comparisonDays: 30,
  /** "total" = absolute score; "gained" = rebased to 0 at each player's earliest in-window point. */
  comparisonMode: "total",
  /** Last-fetched comparison series, cached so the mode toggle can re-render without refetching. */
  comparisonData: [],
  /** Published by the chart so the selection pills can match line colours. @type {{ ign: string, color: string }[]} */
  comparisonSeries: [],
  /** Lowercased IGNs toggled off — hidden but still selected, not persisted. @type {Set<string>} */
  comparisonHidden: new Set(),

  /** Timeframe in hours for the population chart; values in charts/populationChart.js. */
  populationHours: 24,

  /** Timeframe in hours for the /server population chart. */
  serverHours: 24,

  // --- Search autocomplete ---
  autocompleteSelectedIndex: -1,
};

// Modules register their own loader against the topics they depend on, so adding a card touches one module.
/** @type {Map<string, Set<Function>>} */
const subscribers = new Map();

export function subscribe(topics, fn) {
  for (const topic of topics) {
    if (!subscribers.has(topic)) subscribers.set(topic, new Set());
    subscribers.get(topic).add(fn);
  }
}

/** Parallel; rejects if any subscriber does, so init's catch still sees failures. */
export function notify(topic) {
  return Promise.all([...(subscribers.get(topic) ?? [])].map((fn) => fn()));
}

export const enabledGames = ["team_eggwars", "solo_skywars", "free_for_all", "mob_who"];

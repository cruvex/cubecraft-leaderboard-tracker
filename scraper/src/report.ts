/**
 * Posts a run summary to a Discord webhook. Silent when DISCORD_WEBHOOK_URL is
 * unset, so local runs and the audit scripts stay out of the channel.
 *
 * The cron runs every 15 minutes and Cubecraft updates far less often than
 * that, so a quiet run sends nothing -- otherwise the channel would carry ~96
 * "nothing happened" messages a day and the updates would be lost in them.
 */
const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

const green = 0x57f287;
const yellow = 0xfee75c;
const red = 0xed4245;

export type GameReport = { game: string } & (
  | { status: "saved"; rows: number; lastUpdated: Date; fetched: number }
  | { status: "unchanged" }
  | { status: "partial"; rows: number; expected: number }
  | { status: "unresolved"; resolved: number; total: number; missing: string[] }
  | { status: "missing" }
);

export type RunReport =
  | { kind: "run"; games: GameReport[]; durationMs: number }
  | { kind: "disabled" }
  | { kind: "failed"; error: unknown };

export async function sendReport(report: RunReport) {
  if (!webhookUrl) return;

  const embed = buildEmbed(report);
  if (!embed) return;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`Webhook returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    // A scrape that worked is not a failed run just because Discord was down.
    console.error("Failed to post report:", err);
  }
}

/** Returns null for a run not worth posting. */
function buildEmbed(report: RunReport) {
  if (report.kind === "failed") {
    return {
      title: "Scrape failed",
      description: codeBlock(formatError(report.error)),
      color: red,
      timestamp: new Date().toISOString(),
    };
  }

  if (report.kind === "disabled") {
    return {
      title: "Leaderboards are disabled",
      description: "Cubepanion is reporting leaderboards as disabled; nothing was scraped.",
      color: yellow,
      timestamp: new Date().toISOString(),
    };
  }

  const saved = report.games.filter((g) => g.status === "saved");
  const problems = report.games.filter(
    (g) => g.status !== "saved" && g.status !== "unchanged",
  );

  if (saved.length === 0 && problems.length === 0) return null;

  const unchanged = report.games.filter((g) => g.status === "unchanged");

  return {
    title: title(saved.length, problems.length),
    color: problems.length > 0 ? (saved.length > 0 ? yellow : red) : green,
    fields: [...saved, ...problems].map(field),
    description:
      unchanged.length > 0
        ? `Unchanged: ${unchanged.map((g) => g.game).join(", ")}`
        : undefined,
    footer: {
      text: `${report.games.length} games checked in ${(report.durationMs / 1000).toFixed(1)}s`,
    },
    timestamp: new Date().toISOString(),
  };
}

function title(saved: number, problems: number): string {
  if (saved === 0) {
    return problems === 1 ? "A leaderboard was skipped" : `${problems} leaderboards were skipped`;
  }

  const updated = saved === 1 ? "Leaderboard updated" : `${saved} leaderboards updated`;

  // The title is all a notification shows, so it cannot say only the good half.
  return problems > 0 ? `${updated}, ${problems} skipped` : updated;
}

function field(g: GameReport) {
  return { name: `${icon(g)} ${g.game}`, value: value(g), inline: false };
}

function icon(g: GameReport): string {
  return g.status === "saved" ? "🟢" : g.status === "missing" ? "🔴" : "🟡";
}

function value(g: GameReport): string {
  switch (g.status) {
    case "saved": {
      const players =
        g.fetched > 0 ? `\n${g.fetched} new ${g.fetched === 1 ? "player" : "players"} resolved from Mojang` : "";
      return `${g.rows} rows · updated ${relative(g.lastUpdated)}${players}`;
    }
    case "partial":
      return `Returned ${g.rows} rows, expected at least ${g.expected} — partial response, not stored.`;
    case "unresolved":
      return `Resolved ${g.resolved} of ${g.total} players, not stored.\nMissing: ${list(g.missing)}`;
    case "missing":
      return "No leaderboard returned, or the response did not parse.";
    case "unchanged":
      return "Not updated since the last snapshot.";
  }
}

/** Discord renders this in the reader's own timezone. */
function relative(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

/** Field values cap at 1024 characters and a bad run can miss hundreds. */
function list(names: string[]): string {
  const shown = names.slice(0, 10);
  const rest = names.length - shown.length;
  return shown.join(", ") + (rest > 0 ? ` and ${rest} more` : "");
}

function formatError(error: unknown): string {
  const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
  return text.length > 1000 ? `${text.slice(0, 1000)}…` : text;
}

function codeBlock(text: string): string {
  return `\`\`\`\n${text}\n\`\`\``;
}

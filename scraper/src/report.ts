/**
 * Posts a run summary to a Discord webhook. Sends nothing when
 * DISCORD_WEBHOOK_URL is unset, or when the run changed nothing -- the cron
 * runs every 15 minutes and Cubepanion updates far less often.
 */
const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

const green = 0x57f287;
const yellow = 0xfee75c;
const red = 0xed4245;

export type GameReport = { game: string } & (
  | { status: "saved"; lastUpdated: Date }
  | { status: "unchanged" }
  | { status: "partial"; rows: number; expected: number }
  | { status: "unresolved"; resolved: number; total: number }
  | { status: "missing" }
);

type ReportedGame = Exclude<GameReport, { status: "unchanged" }>;

export type RunReport =
  | { kind: "run"; games: GameReport[] }
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
      title: "The update run failed",
      description: `Nothing was updated this run. It will be retried on the next one.\n${codeBlock(formatError(report.error))}`,
      color: red,
      timestamp: new Date().toISOString(),
    };
  }

  if (report.kind === "disabled") {
    return {
      title: "Leaderboards are turned off",
      description:
        "Cubepanion has leaderboards disabled right now, so there is nothing to update.",
      color: yellow,
      timestamp: new Date().toISOString(),
    };
  }

  const changed = report.games.filter(
    (g): g is ReportedGame => g.status !== "unchanged",
  );

  if (changed.length === 0) return null;

  const saved = changed.filter((g) => g.status === "saved");
  const problems = changed.filter((g) => g.status !== "saved");

  return {
    title: title(saved, problems),
    color: problems.length > 0 ? (saved.length > 0 ? yellow : red) : green,
    fields: [...saved, ...problems].map(field),
    description:
      problems.length > 0
        ? "Skipped boards are picked up again on the next run."
        : undefined,
    timestamp: new Date().toISOString(),
  };
}

function title(saved: ReportedGame[], problems: ReportedGame[]): string {
  if (saved.length === 0) {
    return problems.length === 1
      ? `${problems[0]!.game} could not be updated`
      : `${problems.length} leaderboards could not be updated`;
  }

  const updated = `${saved.length} Leaderboard${saved.length === 1 ? "" : "s"} updated`;

  // The title is all a notification shows, so it cannot say only the good half.
  return problems.length > 0 ? `${updated}, ${problems.length} skipped` : updated;
}

function field(g: ReportedGame) {
  const name = g.status === "saved" ? g.game : `⚠️ ${g.game}`;
  return { name, value: value(g), inline: false };
}

function value(g: ReportedGame): string {
  switch (g.status) {
    case "saved":
      return `Board updated ${relative(g.lastUpdated)}`;
    case "partial":
      return `Cubepanion only sent ${count(g.rows)} of ${count(g.expected)} players, so this update was skipped.`;
    case "unresolved":
      return `${count(g.total - g.resolved)} of ${count(g.total)} names could not be matched to a Minecraft account, so this update was skipped.`;
    case "missing":
      return "Cubepanion did not return this leaderboard.";
  }
}

function count(n: number): string {
  return n.toLocaleString("en-US");
}

/** Discord renders this in the reader's own timezone. */
function relative(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function formatError(error: unknown): string {
  const text = error instanceof Error ? errorText(error) : String(error);
  return text.length > 1000 ? `${text.slice(0, 1000)}…` : text;
}

/** Bun does not always prefix the stack with the message. */
function errorText(error: Error): string {
  const stack = error.stack ?? "";
  return stack.includes(error.message)
    ? stack
    : `${error.message}\n${stack}`.trim();
}

function codeBlock(text: string): string {
  return `\`\`\`\n${text}\n\`\`\``;
}

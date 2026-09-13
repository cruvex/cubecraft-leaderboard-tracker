// Helpers for the selected period: "7" or "30" days, or a "YYYY-MM" month.
import { state } from "./state.js";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

// Formatted in UTC to match the server's month buckets.
const longMonth = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonth = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" });

/** The selected period as `{ days }` or `{ month }`. */
export function selectedPeriod() {
  const period = state.topGainersPeriod;
  if (MONTH_PATTERN.test(period)) return { month: period };
  return { days: Number(period) };
}

/** "7D", or the month's name, e.g. "August 2026". */
export function periodLabel() {
  const { days, month } = selectedPeriod();
  return month ? formatMonth(month) : `${days}D`;
}

export function monthStart(month) {
  return new Date(`${month}-01T00:00:00Z`);
}

/** "August 2026". */
export function formatMonth(month) {
  return longMonth.format(monthStart(month));
}

/** "Aug". */
export function formatShortMonth(month) {
  return shortMonth.format(monthStart(month));
}

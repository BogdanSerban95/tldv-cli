/**
 * Date input parsing and human formatting.
 *
 * The API accepts a date or a date-time for `from`/`to`, but its own tooling validates the
 * full ISO form with a trailing Z, so everything here normalises to that stricter shape.
 */

import { UsageError } from "./errors.js";

const RELATIVE = /^(\d+)\s*(h|d|w|m|y)$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const MS = { h: 3_600_000, d: 86_400_000, w: 604_800_000 } as const;

export type DateBound = "from" | "to";

/**
 * Accepts `2026-07-01`, a full ISO timestamp, `today`, `yesterday`, `now`, or a relative
 * offset into the past such as `24h`, `30d`, `2w`, `6m`, `1y`.
 *
 * A date without a time is widened to cover the whole day: the start of it for `from`, the
 * last millisecond of it for `to`, so `--to 2026-07-31` includes the 31st.
 */
export function parseDateInput(input: string, bound: DateBound, now = new Date()): string {
  const value = input.trim().toLowerCase();
  if (!value) throw new UsageError(`Empty --${bound} value.`);

  if (value === "now") return now.toISOString();

  if (value === "today" || value === "yesterday") {
    const day = new Date(now);
    if (value === "yesterday") day.setDate(day.getDate() - 1);
    return dayBoundary(day, bound);
  }

  const relative = RELATIVE.exec(value);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2]!.toLowerCase() as "h" | "d" | "w" | "m" | "y";
    const past = new Date(now);
    if (unit === "m") past.setMonth(past.getMonth() - amount);
    else if (unit === "y") past.setFullYear(past.getFullYear() - amount);
    else past.setTime(past.getTime() - amount * MS[unit]);
    return past.toISOString();
  }

  if (DATE_ONLY.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) throw invalid(input, bound);
    if (bound === "to") parsed.setUTCHours(23, 59, 59, 999);
    return parsed.toISOString();
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) throw invalid(input, bound);
  return parsed.toISOString();
}

function dayBoundary(day: Date, bound: DateBound): string {
  const copy = new Date(day);
  if (bound === "from") copy.setHours(0, 0, 0, 0);
  else copy.setHours(23, 59, 59, 999);
  return copy.toISOString();
}

function invalid(input: string, bound: DateBound): UsageError {
  return new UsageError(
    `Could not read --${bound} value ${JSON.stringify(input)}.`,
    "Use 2026-07-01, a full ISO timestamp, today, yesterday, or an offset like 24h / 30d / 2w / 6m / 1y.",
  );
}

/** Seconds to `1h 05m 31s`, dropping empty leading units. */
export function humanizeDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function formatRelative(date: Date, now = new Date()): string {
  const deltaMs = now.getTime() - date.getTime();
  if (deltaMs < 0) return "in the future";
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** Local-time `YYYY-MM-DD`, used for table columns and generated filenames. */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local-time `YYYY-MM-DD HH:MM`. */
export function formatDateTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${dateKey(date)} ${hh}:${mm}`;
}

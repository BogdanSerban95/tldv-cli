import type { Command } from "commander";

import type { ListMeetingsParams, MeetingType } from "../api/types.js";
import { parseDateInput } from "../core/dates.js";
import { UsageError } from "../core/errors.js";

export interface FilterOptions {
  query?: string;
  from?: string;
  to?: string;
  type?: string;
  everyone?: boolean;
}

/** Filters shared by `ls` and `export`, defined once so the two never drift. */
export function addFilterOptions(command: Command): Command {
  return command
    .option("-q, --query <text>", "full-text search (tl;dv flags this as an expensive query)")
    .option("--from <when>", "earliest meeting: 2026-07-01, an ISO timestamp, today, or 30d")
    .option("--to <when>", "latest meeting, same formats as --from")
    .option("--type <kind>", "internal or external")
    .option("--everyone", "include meetings you did not attend (default: only yours)");
}

export function buildListParams(options: FilterOptions, now = new Date()): ListMeetingsParams {
  const params: ListMeetingsParams = { onlyParticipated: !options.everyone };
  if (options.query) params.query = options.query;
  if (options.from) params.from = parseDateInput(options.from, "from", now);
  if (options.to) params.to = parseDateInput(options.to, "to", now);
  if (options.type) params.meetingType = parseMeetingType(options.type);
  return params;
}

function parseMeetingType(value: string): MeetingType {
  const normalized = value.trim().toLowerCase();
  if (normalized === "internal" || normalized === "external") return normalized;
  throw new UsageError(
    `--type expects internal or external, got ${JSON.stringify(value)}.`,
    "internal means every participant shares your email domain; external means at least one does not.",
  );
}

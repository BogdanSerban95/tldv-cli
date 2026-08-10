/**
 * Turns whatever the user typed into a meeting.
 *
 * Nobody has a meeting id to hand; they have a browser URL, a half-remembered title, or they
 * mean "the one that just ended". Accepting only ids would push that lookup onto the user.
 */

import { isCancel, select } from "@clack/prompts";

import type { Meeting } from "../api/types.js";
import type { Context } from "../context.js";
import { dateKey, humanizeDuration } from "./dates.js";
import { TldvError, UsageError } from "./errors.js";

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const URL_ID = /\/meetings\/([a-z0-9]{12,})/i;
const LATEST = new Set(["latest", "last"]);
const SEARCH_LIMIT = 10;

export interface ResolveOptions {
  /** Allow a picker when a name search is ambiguous. */
  interactive?: boolean;
  /** Restrict the name search to meetings the key's owner attended. */
  onlyParticipated?: boolean;
}

/** An id or a tl;dv URL resolves offline; anything else needs the API. */
export function extractMeetingId(input: string): string | undefined {
  const value = input.trim();
  if (OBJECT_ID.test(value)) return value;
  const fromUrl = URL_ID.exec(value);
  if (fromUrl) return fromUrl[1];
  return undefined;
}

export async function resolveMeetingId(
  ctx: Context,
  input: string,
  options: ResolveOptions = {},
): Promise<string> {
  const direct = extractMeetingId(input);
  if (direct) return direct;
  const meeting = await resolveMeeting(ctx, input, options);
  return meeting.id;
}

export async function resolveMeeting(
  ctx: Context,
  input: string,
  options: ResolveOptions = {},
): Promise<Meeting> {
  const value = input.trim();
  if (!value)
    throw new UsageError("No meeting given.", "Pass an id, a tl;dv URL, a title, or `latest`.");

  const direct = extractMeetingId(value);
  if (direct) return ctx.api.getMeeting(direct);

  if (LATEST.has(value.toLowerCase())) {
    const page = await ctx.api.listMeetings({
      limit: 1,
      page: 1,
      onlyParticipated: options.onlyParticipated ?? true,
    });
    const meeting = page.results[0];
    if (!meeting) {
      throw new TldvError("No meetings found on this account.", {
        hint: "Widen the search with `tldv ls --everyone`.",
      });
    }
    return meeting;
  }

  return searchByName(ctx, value, options);
}

async function searchByName(
  ctx: Context,
  query: string,
  options: ResolveOptions,
): Promise<Meeting> {
  // tl;dv flags `query` as an expensive operation, so it only runs once ids and URLs are ruled out.
  const page = await ctx.api.listMeetings({
    query,
    limit: SEARCH_LIMIT,
    page: 1,
    onlyParticipated: options.onlyParticipated ?? true,
  });
  const matches = page.results;

  if (matches.length === 0) {
    throw new TldvError(`No meeting matches ${JSON.stringify(query)}.`, {
      hint: "Search more widely with `tldv ls --query <text> --everyone`.",
    });
  }
  if (matches.length === 1) return matches[0]!;

  const exact = matches.filter((m) => m.name.toLowerCase() === query.toLowerCase());
  if (exact.length === 1) return exact[0]!;

  if (!(options.interactive ?? true) || !process.stdin.isTTY || !process.stderr.isTTY) {
    throw new UsageError(
      `${matches.length} meetings match ${JSON.stringify(query)}.`,
      `Re-run with one of these ids:\n${matches.map(describe).join("\n")}`,
    );
  }

  const picked = await select({
    message: `${matches.length} meetings match "${query}"`,
    options: matches.map((meeting) => ({
      value: meeting.id,
      label: meeting.name,
      hint: `${meeting.happenedAt ? dateKey(meeting.happenedAt) : "undated"} · ${humanizeDuration(meeting.duration)}`,
    })),
  });

  if (isCancel(picked)) throw new TldvError("Cancelled.");
  return matches.find((meeting) => meeting.id === picked) ?? matches[0]!;
}

function describe(meeting: Meeting): string {
  const when = meeting.happenedAt ? dateKey(meeting.happenedAt) : "undated";
  return `  ${meeting.id}  ${when}  ${meeting.name}`;
}

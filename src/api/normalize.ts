/**
 * Lenient parsers from raw JSON to domain models.
 *
 * Deliberately no schema validator. The published OpenAPI spec is wrong in both directions:
 * it marks `template` and `extraProperties` required although live responses omit them, and
 * it omits fields the API does return (`status` on a meeting, `id`/`domain` on a user). A
 * strict validator would reject valid payloads. Every model keeps `raw`, so `--json` and
 * `-f json` emit exactly what the server sent.
 */

import type {
  ImportResult,
  Meeting,
  MeetingPage,
  Note,
  Notes,
  Sentence,
  Topic,
  Transcript,
  User,
} from "./types.js";

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalStr(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function parseUser(value: unknown): User {
  const record = asRecord(value);
  const user: User = { name: str(record.name), email: str(record.email) };
  const id = optionalStr(record.id);
  const domain = optionalStr(record.domain);
  if (id) user.id = id;
  if (domain) user.domain = domain;
  return user;
}

export function userLabel(user: User): string {
  return user.name || user.email || "unknown";
}

export function parseMeeting(value: unknown): Meeting {
  const record = asRecord(value);
  const meeting: Meeting = {
    id: str(record.id),
    name: str(record.name, "(untitled)"),
    happenedAt: parseDate(record.happenedAt),
    url: str(record.url),
    duration: num(record.duration),
    organizer: parseUser(record.organizer),
    invitees: list(record.invitees).map(parseUser),
    raw: record,
  };
  const status = optionalStr(record.status);
  if (status) meeting.status = status;
  return meeting;
}

export function parseMeetingPage(value: unknown): MeetingPage {
  const record = asRecord(value);
  const results = list(record.results).map(parseMeeting);
  return {
    page: num(record.page, 1),
    pages: num(record.pages, 1),
    total: num(record.total, results.length),
    pageSize: num(record.pageSize, results.length),
    results,
    raw: record,
  };
}

export function parseSentence(value: unknown): Sentence {
  const record = asRecord(value);
  const start = num(record.startTime);
  return {
    speaker: str(record.speaker, "Unknown").trim() || "Unknown",
    text: str(record.text).trim(),
    start,
    end: num(record.endTime, start),
  };
}

export function parseTranscript(value: unknown): Transcript {
  const record = asRecord(value);
  return {
    id: str(record.id),
    meetingId: str(record.meetingId),
    sentences: list(record.data).map(parseSentence),
    raw: record,
  };
}

export function parseTopic(value: unknown): Topic {
  const record = asRecord(value);
  return {
    id: str(record.id),
    order: num(record.order),
    title: str(record.title),
    summary: str(record.summary),
  };
}

export function parseNote(value: unknown): Note {
  const record = asRecord(value);
  return {
    segmentId: str(record.segmentId),
    timestamp: num(record.timestamp),
    text: str(record.text),
    topicId: str(record.topicId),
  };
}

export function parseNotes(value: unknown): Notes {
  const record = asRecord(value);
  return {
    markdown: str(record.markdownContent),
    structured: list(record.structuredNotes).map(parseNote),
    topics: list(record.topics).map(parseTopic),
    raw: record,
  };
}

export function parseImportResult(value: unknown): ImportResult {
  const record = asRecord(value);
  return {
    success: record.success === true,
    jobId: str(record.jobId),
    message: str(record.message),
    raw: record,
  };
}

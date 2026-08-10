/** Domain models the CLI works with, plus the request shapes the API accepts. */

export interface User {
  name: string;
  email: string;
  /** Undocumented but present in live responses. */
  id?: string;
  /** Undocumented but present in live responses; the participant's email domain. */
  domain?: string;
}

export interface Meeting {
  id: string;
  name: string;
  happenedAt: Date | undefined;
  url: string;
  /** Seconds. */
  duration: number;
  organizer: User;
  invitees: User[];
  /** Undocumented; observed values include "successful". */
  status?: string;
  /** Untouched payload, so `--json` never loses a field this CLI has not modelled. */
  raw: Record<string, unknown>;
}

export interface MeetingPage {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  results: Meeting[];
  raw: Record<string, unknown>;
}

export interface Sentence {
  speaker: string;
  text: string;
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
}

export interface Transcript {
  id: string;
  meetingId: string;
  sentences: Sentence[];
  raw: Record<string, unknown>;
}

export interface Topic {
  id: string;
  order: number;
  title: string;
  summary: string;
}

export interface Note {
  segmentId: string;
  /** Seconds from the start of the recording. */
  timestamp: number;
  text: string;
  topicId: string;
}

export interface Notes {
  markdown: string;
  structured: Note[];
  topics: Topic[];
  raw: Record<string, unknown>;
}

export interface ImportResult {
  success: boolean;
  /** No status endpoint exists for this id; completion only surfaces over webhooks. */
  jobId: string;
  message: string;
  raw: Record<string, unknown>;
}

export type MeetingType = "internal" | "external";

export interface ListMeetingsParams {
  query?: string;
  page?: number;
  /** API maximum is 100. */
  limit?: number;
  /** ISO 8601. */
  from?: string;
  to?: string;
  onlyParticipated?: boolean;
  meetingType?: MeetingType;
}

export interface ImportMeetingBody {
  name: string;
  url: string;
  happenedAt?: string;
  dryRun?: boolean;
  participants?: string[];
}

/** The API refuses to page past this many results and asks for a narrower range instead. */
export const MAX_TOTAL_RESULTS = 10_000;
export const MAX_PAGE_SIZE = 100;

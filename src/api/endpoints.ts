import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import { ApiError, NetworkError } from "../core/errors.js";
import type { HttpClient } from "./client.js";
import {
  asRecord,
  parseImportResult,
  parseMeeting,
  parseMeetingPage,
  parseNotes,
  parseTranscript,
} from "./normalize.js";
import {
  type ImportMeetingBody,
  type ImportResult,
  type ListMeetingsParams,
  MAX_PAGE_SIZE,
  MAX_TOTAL_RESULTS,
  type Meeting,
  type MeetingPage,
  type Notes,
  type Transcript,
} from "./types.js";

const API = "/v1alpha1";

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number | undefined;
}

export class TldvApi {
  constructor(private readonly http: HttpClient) {}

  async listMeetings(params: ListMeetingsParams = {}): Promise<MeetingPage> {
    const payload = await this.http.json<unknown>("GET", `${API}/meetings`, {
      query: {
        query: params.query,
        page: params.page,
        limit: params.limit,
        from: params.from,
        to: params.to,
        onlyParticipated: params.onlyParticipated,
        meetingType: params.meetingType,
      },
    });
    return parseMeetingPage(payload);
  }

  /**
   * Pages until `max` meetings have been yielded or the server runs out.
   *
   * `onPage` fires per response so a caller can drive a spinner; `onCapped` fires once when
   * the result set exceeds the API's hard 10,000 ceiling, which is a real truncation the
   * user needs to know about rather than a detail to swallow.
   */
  async *iterateMeetings(
    params: ListMeetingsParams,
    options: {
      max?: number;
      onPage?: (page: MeetingPage) => void;
      onCapped?: (total: number) => void;
    } = {},
  ): AsyncGenerator<Meeting> {
    const max = options.max ?? Number.POSITIVE_INFINITY;
    const pageSize = Math.min(params.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
    let page = params.page ?? 1;
    let yielded = 0;
    let capped = false;

    for (;;) {
      const result = await this.listMeetings({ ...params, page, limit: pageSize });
      options.onPage?.(result);

      if (!capped && result.total > MAX_TOTAL_RESULTS) {
        capped = true;
        options.onCapped?.(result.total);
      }

      for (const meeting of result.results) {
        yield meeting;
        if (++yielded >= max) return;
      }

      if (result.results.length === 0 || page >= result.pages) return;
      if (yielded >= MAX_TOTAL_RESULTS) return;
      page += 1;
    }
  }

  async getMeeting(meetingId: string): Promise<Meeting> {
    const payload = await this.http.json<unknown>("GET", `${API}/meetings/${encode(meetingId)}`);
    return parseMeeting(payload);
  }

  async getTranscript(meetingId: string): Promise<Transcript> {
    const payload = await this.http.json<unknown>(
      "GET",
      `${API}/meetings/${encode(meetingId)}/transcript`,
    );
    return parseTranscript(payload);
  }

  async getNotes(meetingId: string): Promise<Notes> {
    const payload = await this.http.json<unknown>(
      "GET",
      `${API}/meetings/${encode(meetingId)}/notes`,
    );
    return parseNotes(payload);
  }

  /** The signed URL behind the download redirect. tl;dv expires it after six hours. */
  async getDownloadUrl(meetingId: string): Promise<string> {
    const path = `${API}/meetings/${encode(meetingId)}/download`;
    const response = await this.http.send("GET", path, { redirect: "manual" });

    const location = response.headers.get("location");
    if (location) return location;

    // Documented as a 302, but tolerate a JSON body carrying the URL instead.
    const body = asRecord(await response.json().catch(() => undefined));
    const url = body.url ?? body.downloadUrl;
    if (typeof url === "string" && url) return url;

    throw new ApiError({
      status: response.status,
      method: "GET",
      path,
      message: "tl;dv did not return a download URL for this meeting.",
      hint: "The recording may still be processing.",
    });
  }

  /**
   * Streams a signed URL to `destination` through a `.part` file, so an interrupted run
   * never leaves a truncated file that looks complete.
   *
   * Takes the URL rather than a meeting id because callers need it first: the file extension
   * comes from the URL, and `--url-only` stops there.
   */
  async downloadFromUrl(
    url: string,
    destination: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<{ bytes: number }> {
    // A signed URL carries its own credentials; sending the API key to blob storage is noise.
    let response: Response;
    try {
      response = await fetch(url, { redirect: "follow" });
    } catch (error) {
      throw new NetworkError(
        `Could not fetch the signed recording URL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok || !response.body) {
      throw new ApiError({
        status: response.status,
        method: "GET",
        path: "<signed download url>",
        message: `Downloading the recording failed (HTTP ${response.status}).`,
        hint: "Signed URLs expire after six hours; re-run to mint a fresh one.",
      });
    }

    const header = response.headers.get("content-length");
    const totalBytes = header && Number.isFinite(Number(header)) ? Number(header) : undefined;

    const partial = `${destination}.part`;
    let receivedBytes = 0;
    const source = Readable.fromWeb(response.body as WebReadableStream<Uint8Array>);
    source.on("data", (chunk: Buffer) => {
      receivedBytes += chunk.length;
      onProgress?.({ receivedBytes, totalBytes });
    });

    try {
      await pipeline(source, createWriteStream(partial));
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }

    await rename(partial, destination);
    return { bytes: receivedBytes };
  }

  async importMeeting(body: ImportMeetingBody): Promise<ImportResult> {
    const payload = await this.http.json<unknown>("POST", `${API}/meetings/import`, { body });
    return parseImportResult(payload);
  }

  async health(): Promise<Record<string, unknown>> {
    const payload = await this.http.json<unknown>("GET", `${API}/health`);
    return asRecord(payload);
  }
}

function encode(meetingId: string): string {
  return encodeURIComponent(meetingId);
}

/**
 * HTTP transport: auth header, timeouts, retry with backoff, and status-to-error mapping.
 *
 * tl;dv documents no rate limits, which means unknown rather than absent, so 429 and 5xx are
 * retried with exponential backoff and `Retry-After` is honoured when the server sends it.
 */

import { API_KEYS_URL } from "../core/config.js";
import { ApiError, ExitCode, NetworkError } from "../core/errors.js";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_BACKOFF_MS = 8_000;
const BASE_BACKOFF_MS = 500;

export interface RetryInfo {
  attempt: number;
  attempts: number;
  delayMs: number;
  reason: string;
}

export interface HttpClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  /** Retries after the first try. 0 disables retrying. */
  retries?: number;
  onRetry?: (info: RetryInfo) => void;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** `manual` keeps the 302 so a caller can read the signed Location itself. */
  redirect?: "follow" | "manual" | "error";
  timeoutMs?: number;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly onRetry: ((info: RetryInfo) => void) | undefined;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retries = options.retries ?? 3;
    this.onRetry = options.onRetry;
  }

  async json<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.send(method, path, options);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text.trim()) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError({
        status: response.status,
        method,
        path,
        message: "tl;dv returned a response that is not JSON.",
        body: text.slice(0, 500),
        hint: "This usually means a proxy or captive portal answered instead of the API.",
      });
    }
  }

  /** Returns the raw response, retries and error mapping already applied. */
  async send(method: string, path: string, options: RequestOptions = {}): Promise<Response> {
    const url = this.buildUrl(path, options.query);
    const attempts = this.retries + 1;

    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers: this.headers(options.body !== undefined),
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          redirect: options.redirect ?? "follow",
          signal: AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs),
        });
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await this.pause(attempt, attempts, describeNetworkError(error));
          continue;
        }
        throw asNetworkError(error, url);
      }

      if (response.ok || isRedirect(response.status)) return response;

      if (RETRYABLE_STATUS.has(response.status) && attempt < attempts) {
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        await this.pause(attempt, attempts, `HTTP ${response.status}`, retryAfter);
        continue;
      }

      throw await toApiError(response, method, path, attempts);
    }

    throw asNetworkError(lastError, url);
  }

  private headers(hasBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      accept: "application/json",
      "user-agent": "tldv-cli",
    };
    if (hasBody) headers["content-type"] = "application/json";
    return headers;
  }

  private buildUrl(path: string, query: RequestOptions["query"]): string {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async pause(
    attempt: number,
    attempts: number,
    reason: string,
    retryAfterMs?: number,
  ): Promise<void> {
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
    const delayMs = Math.round((retryAfterMs ?? backoff) + Math.random() * 250);
    this.onRetry?.({ attempt, attempts, delayMs, reason });
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = new Date(header);
  if (Number.isNaN(date.getTime())) return undefined;
  return Math.max(0, date.getTime() - Date.now());
}

function describeNetworkError(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") return "request timed out";
  if (error instanceof Error) return error.message;
  return "network error";
}

function asNetworkError(error: unknown, url: string): NetworkError {
  const host = safeHost(url);
  if (error instanceof Error && error.name === "TimeoutError") {
    return new NetworkError(
      `Timed out waiting for ${host}.`,
      "Raise the ceiling with --timeout, or retry when the connection is healthier.",
    );
  }
  return new NetworkError(
    `Could not reach ${host}: ${describeNetworkError(error)}`,
    "Check connectivity, then confirm the service is up with `tldv health`.",
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function toApiError(
  response: Response,
  method: string,
  path: string,
  attempts: number,
): Promise<ApiError> {
  const body = await readBody(response);
  const serverMessage = extractMessage(body);

  switch (response.status) {
    case 400:
      return new ApiError({
        status: 400,
        method,
        path,
        message: serverMessage ?? "tl;dv rejected the request.",
        body,
        exitCode: ExitCode.validation,
        hint: formatConstraints(body),
      });
    case 401:
      return new ApiError({
        status: 401,
        method,
        path,
        message: serverMessage ?? "tl;dv rejected the API key.",
        body,
        exitCode: ExitCode.auth,
        hint: `Check \`tldv auth status\`, or create a new key at ${API_KEYS_URL}`,
      });
    case 403:
      return new ApiError({
        status: 403,
        method,
        path,
        message: serverMessage ?? "That meeting is not readable with this API key.",
        body,
        exitCode: ExitCode.forbidden,
        hint: "API access follows meeting ownership, which is narrower than what the web app shows you.",
      });
    case 404:
      return new ApiError({
        status: 404,
        method,
        path,
        message: serverMessage ?? "Not found.",
        body,
        exitCode: ExitCode.notFound,
        hint: path.endsWith("/transcript")
          ? "The meeting may exist without a transcript yet — tl;dv produces it after processing."
          : "Check the meeting id, or find it with `tldv ls`.",
      });
    case 429:
      return new ApiError({
        status: 429,
        method,
        path,
        message: `Rate limited by tl;dv after ${attempts} attempt(s).`,
        body,
        hint: "tl;dv does not document its limits. Try again shortly, or lower --concurrency on `tldv export`.",
      });
    default:
      return new ApiError({
        status: response.status,
        method,
        path,
        message: serverMessage ?? `tl;dv API error (HTTP ${response.status}).`,
        body,
        hint:
          response.status >= 500 ? "Server-side; `tldv health` reports service state." : undefined,
      });
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
}

function extractMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const message = (body as Record<string, unknown>).message;
  return typeof message === "string" && message ? message : undefined;
}

/** Turns the documented `errors: [{property, constraints}]` payload into readable lines. */
function formatConstraints(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const errors = (body as Record<string, unknown>).errors;
  if (!Array.isArray(errors) || errors.length === 0) return undefined;

  const lines: string[] = [];
  for (const entry of errors) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const property = typeof record.property === "string" ? record.property : "?";
    const constraints = record.constraints;
    if (constraints && typeof constraints === "object") {
      for (const value of Object.values(constraints as Record<string, unknown>)) {
        if (typeof value === "string") lines.push(`${property}: ${value}`);
      }
    } else {
      lines.push(property);
    }
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
}

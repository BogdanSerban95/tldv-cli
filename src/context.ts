import type { Command } from "commander";

import { HttpClient } from "./api/client.js";
import { TldvApi } from "./api/endpoints.js";
import { type Config, loadConfig } from "./core/config.js";
import { MissingApiKeyError, UsageError } from "./core/errors.js";
import { Output } from "./ui/output.js";
import { setColorEnabled } from "./ui/theme.js";

export interface GlobalOptions {
  quiet?: boolean;
  color?: boolean;
  timeout?: string;
  retries?: string;
}

export interface Context {
  api: TldvApi;
  out: Output;
  config: Config;
}

/** Commander stores `--quiet` and friends on the root command; this reaches them from a leaf. */
export function globalsOf(command: Command): GlobalOptions {
  return command.optsWithGlobals() as GlobalOptions;
}

export function createOutput(globals: GlobalOptions): Output {
  // Commander maps `--no-color` to color === false.
  if (globals.color === false) setColorEnabled(false);
  return new Output({ quiet: globals.quiet ?? false });
}

export function createContext(command: Command, options: { requireKey?: boolean } = {}): Context {
  const globals = globalsOf(command);
  const out = createOutput(globals);
  const config = loadConfig();

  // `health` is the one unauthenticated endpoint, so it can run before a key exists.
  if (!config.apiKey && options.requireKey !== false) throw new MissingApiKeyError();

  const http = new HttpClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey ?? "",
    timeoutMs: positiveInt(globals.timeout, 30_000, "--timeout"),
    retries: positiveInt(globals.retries, 3, "--retries", true),
    onRetry: (info) =>
      out.note(
        `${info.reason}; retry ${info.attempt}/${info.attempts - 1} in ${Math.round(info.delayMs)}ms`,
      ),
  });

  return { api: new TldvApi(http), out, config };
}

export function positiveInt(
  raw: string | undefined,
  fallback: number,
  flag: string,
  allowZero = false,
): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new UsageError(
      `${flag} expects ${allowZero ? "a non-negative" : "a positive"} integer, got ${JSON.stringify(raw)}.`,
    );
  }
  return value;
}

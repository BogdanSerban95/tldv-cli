/**
 * Output routing.
 *
 * The contract the whole CLI keeps: payload goes to stdout, everything else goes to stderr.
 * That is what makes `tldv transcript latest > notes.txt` produce a clean file while the
 * user still sees progress and warnings on screen.
 */

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { symbols, theme } from "./theme.js";

export type Target = { kind: "stdout" } | { kind: "file"; path: string };

export interface OutputOptions {
  quiet?: boolean;
}

export class Output {
  readonly quiet: boolean;

  constructor(options: OutputOptions = {}) {
    this.quiet = options.quiet ?? false;
  }

  get isInteractive(): boolean {
    return Boolean(process.stderr.isTTY) && !this.quiet;
  }

  /** Payload, verbatim. */
  data(text: string): void {
    process.stdout.write(text);
  }

  line(text = ""): void {
    process.stdout.write(`${text}\n`);
  }

  json(value: unknown): void {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  }

  info(text: string): void {
    if (!this.quiet) process.stderr.write(`${theme.dim(symbols.info)} ${text}\n`);
  }

  success(text: string): void {
    if (!this.quiet) process.stderr.write(`${theme.green(symbols.success)} ${text}\n`);
  }

  warn(text: string): void {
    process.stderr.write(`${theme.yellow(symbols.warn)} ${text}\n`);
  }

  error(text: string): void {
    process.stderr.write(`${theme.red(symbols.error)} ${text}\n`);
  }

  note(text: string): void {
    if (!this.quiet) process.stderr.write(`${theme.dim(text)}\n`);
  }

  /**
   * `-` means stdout. A path to an existing directory, or one ending in a separator, means
   * "put the default filename in here". Anything else is used as given.
   */
  resolveTarget(out: string | undefined, defaultFilename: string): Target {
    if (out === undefined) return { kind: "stdout" };
    if (out === "-") return { kind: "stdout" };

    const endsWithSeparator = /[\\/]$/.test(out);
    const path = resolve(out);
    if (endsWithSeparator || isDirectory(path)) {
      return { kind: "file", path: join(path, defaultFilename) };
    }
    return { kind: "file", path };
  }

  write(target: Target, content: string): void {
    if (target.kind === "stdout") {
      this.data(content);
      return;
    }
    mkdirSync(dirname(target.path), { recursive: true });
    writeFileSync(target.path, content, "utf8");
  }
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function humanBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 || unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

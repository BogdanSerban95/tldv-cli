/**
 * Minimal stderr spinner. Silent on a non-TTY, so piped and CI output stays clean without
 * every command having to ask.
 */

import { symbols, theme } from "./theme.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL_MS = 80;

export interface Spinner {
  update(text: string): void;
  stop(): void;
  succeed(text?: string): void;
  fail(text?: string): void;
}

const noop: Spinner = {
  update: () => {},
  stop: () => {},
  succeed: () => {},
  fail: () => {},
};

export function createSpinner(text: string, enabled: boolean): Spinner {
  if (!enabled || !process.stderr.isTTY) return noop;

  let label = text;
  let frame = 0;
  let lastLineLength = 0;

  const render = (): void => {
    const line = `${theme.cyan(FRAMES[frame % FRAMES.length]!)} ${label}`;
    frame += 1;
    clear();
    process.stderr.write(line);
    lastLineLength = line.length;
  };

  const clear = (): void => {
    if (lastLineLength > 0) process.stderr.write(`\r${" ".repeat(lastLineLength)}\r`);
    else process.stderr.write("\r");
  };

  const timer = setInterval(render, INTERVAL_MS);
  timer.unref();
  render();

  const finish = (symbol: string, message: string | undefined): void => {
    clearInterval(timer);
    clear();
    lastLineLength = 0;
    if (message) process.stderr.write(`${symbol} ${message}\n`);
  };

  return {
    update(next: string) {
      label = next;
    },
    stop() {
      finish("", undefined);
    },
    succeed(message?: string) {
      finish(theme.green(symbols.success), message);
    },
    fail(message?: string) {
      finish(theme.red(symbols.error), message);
    },
  };
}

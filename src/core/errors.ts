/**
 * Every error the CLI prints passes through here, so the exit code and the "what now"
 * hint live next to each other instead of being scattered across commands.
 */

export const ExitCode = {
  ok: 0,
  generic: 1,
  config: 2,
  auth: 3,
  forbidden: 4,
  notFound: 5,
  validation: 6,
  network: 7,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export class TldvError extends Error {
  readonly exitCode: ExitCodeValue;
  /** Actionable next step, printed dimmed under the message. */
  readonly hint: string | undefined;

  constructor(message: string, options: { exitCode?: ExitCodeValue; hint?: string } = {}) {
    super(message);
    this.name = "TldvError";
    this.exitCode = options.exitCode ?? ExitCode.generic;
    this.hint = options.hint;
  }
}

/** The user asked for something the CLI understands but cannot do as written. */
export class UsageError extends TldvError {
  constructor(message: string, hint?: string) {
    super(message, { exitCode: ExitCode.validation, hint });
    this.name = "UsageError";
  }
}

export class ConfigError extends TldvError {
  constructor(message: string, hint?: string) {
    super(message, { exitCode: ExitCode.config, hint });
    this.name = "ConfigError";
  }
}

export class MissingApiKeyError extends ConfigError {
  constructor() {
    super(
      "No tl;dv API key configured.",
      "Run `tldv auth login`, or set TLDV_API_KEY. Keys live at https://tldv.io/app/settings/personal-settings/api-keys",
    );
    this.name = "MissingApiKeyError";
  }
}

export class ApiError extends TldvError {
  readonly status: number;
  readonly method: string;
  readonly path: string;
  readonly body: unknown;

  constructor(args: {
    status: number;
    method: string;
    path: string;
    message: string;
    body?: unknown;
    hint?: string;
    exitCode?: ExitCodeValue;
  }) {
    super(args.message, { exitCode: args.exitCode ?? ExitCode.generic, hint: args.hint });
    this.name = "ApiError";
    this.status = args.status;
    this.method = args.method;
    this.path = args.path;
    this.body = args.body;
  }
}

export class NetworkError extends TldvError {
  constructor(message: string, hint?: string) {
    super(message, { exitCode: ExitCode.network, hint });
    this.name = "NetworkError";
  }
}

export function isTldvError(error: unknown): error is TldvError {
  return error instanceof TldvError;
}

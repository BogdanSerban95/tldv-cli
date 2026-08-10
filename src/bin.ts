import { CommanderError } from "commander";

import { buildProgram } from "./cli.js";
import { ExitCode, isTldvError } from "./core/errors.js";
import { symbols, theme } from "./ui/theme.js";

// `tldv transcript x | head` closes the pipe early; that is the user getting what they asked
// for, not a crash.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(ExitCode.ok);
});

async function main(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  // Commander already printed its own message and chose an exit code.
  if (error instanceof CommanderError) {
    process.exit(error.exitCode);
  }

  if (isTldvError(error)) {
    process.stderr.write(`${theme.red(symbols.error)} ${error.message}\n`);
    if (error.hint) process.stderr.write(`${theme.dim(error.hint)}\n`);
    if (process.env.TLDV_DEBUG) process.stderr.write(`${error.stack}\n`);
    process.exit(error.exitCode);
  }

  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${theme.red(symbols.error)} ${message}\n`);
  if (process.env.TLDV_DEBUG && error instanceof Error) {
    process.stderr.write(`${error.stack}\n`);
  } else {
    process.stderr.write(theme.dim("Set TLDV_DEBUG=1 for a stack trace.\n"));
  }
  process.exit(ExitCode.generic);
});

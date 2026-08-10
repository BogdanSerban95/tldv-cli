import { createRequire } from "node:module";
import { Command } from "commander";

import { authCommand } from "./commands/auth.js";
import { completionCommand } from "./commands/completion.js";
import { downloadCommand } from "./commands/download.js";
import { exportCommand } from "./commands/export.js";
import { healthCommand } from "./commands/health.js";
import { importCommand } from "./commands/import.js";
import { listCommand } from "./commands/list.js";
import { notesCommand } from "./commands/notes.js";
import { showCommand } from "./commands/show.js";
import { transcriptCommand } from "./commands/transcript.js";
import { ENV_API_KEY } from "./core/config.js";

export function version(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function buildProgram(): Command {
  const program = new Command("tldv")
    .description("Command-line client for tl;dv: meetings, transcripts, notes, recordings.")
    .version(version(), "-v, --version")
    .option("--quiet", "suppress progress and status output on stderr")
    .option("--no-color", "disable ANSI colors")
    .option("--timeout <ms>", "per-request timeout", "30000")
    .option("--retries <count>", "retries after a failed request", "3")
    .showHelpAfterError("(run `tldv --help` for usage)")
    .addHelpText(
      "after",
      [
        "",
        "Meetings can be given as an id, a tl;dv URL, a title to search for, or `latest`.",
        "",
        "Examples:",
        "  tldv auth login",
        "  tldv ls --from 7d",
        "  tldv transcript latest -f srt -o ./subs/",
        "  tldv export --from 30d -f md --notes -d ./meetings",
        "",
        `Environment: ${ENV_API_KEY} overrides the stored key.`,
      ].join("\n"),
    );

  program.addCommand(listCommand());
  program.addCommand(showCommand());
  program.addCommand(transcriptCommand());
  program.addCommand(notesCommand());
  program.addCommand(downloadCommand());
  program.addCommand(exportCommand());
  program.addCommand(importCommand());
  program.addCommand(authCommand());
  program.addCommand(healthCommand());
  program.addCommand(completionCommand());

  return program;
}

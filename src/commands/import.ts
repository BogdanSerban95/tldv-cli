import { Command } from "commander";

import type { ImportMeetingBody } from "../api/types.js";
import { createContext } from "../context.js";
import { UsageError } from "../core/errors.js";
import { createSpinner } from "../ui/spinner.js";
import { theme } from "../ui/theme.js";

const SUPPORTED = ["mp3", "mp4", "wav", "m4a", "mkv", "mov", "avi", "wma", "flac"];

interface ImportOptions {
  name: string;
  at?: string;
  participant?: string[];
  dryRun?: boolean;
  json?: boolean;
}

export function importCommand(): Command {
  return new Command("import")
    .description("import an external recording into tl;dv")
    .argument("<media-url>", "publicly reachable URL of the recording")
    .requiredOption("-n, --name <title>", "meeting title")
    .option("--at <iso>", "when the meeting happened (ISO 8601; defaults to now)")
    .option(
      "-p, --participant <email>",
      "participant email; repeat for several",
      (value: string, previous: string[] = []) => [...previous, value],
    )
    .option("--dry-run", "validate without importing (tl;dv persists nothing)")
    .option("--json", "print the raw API payload")
    .addHelpText(
      "after",
      `\nSupported media: ${SUPPORTED.join(", ")}. The URL must be reachable without auth.`,
    )
    .action(async (mediaUrl: string, options: ImportOptions, self: Command) => {
      assertUrl(mediaUrl);
      const ctx = createContext(self);

      const body: ImportMeetingBody = { name: options.name, url: mediaUrl };
      if (options.at) body.happenedAt = parseHappenedAt(options.at);
      if (options.participant?.length) body.participants = options.participant;
      if (options.dryRun) body.dryRun = true;

      const spinner = createSpinner("Submitting import…", ctx.out.isInteractive);
      try {
        const result = await ctx.api.importMeeting(body);
        spinner.stop();

        if (options.json) {
          ctx.out.json(result.raw);
          return;
        }

        if (!result.success) {
          ctx.out.warn(result.message || "tl;dv did not accept the import.");
          return;
        }

        ctx.out.success(result.message || "Import accepted.");
        if (result.jobId) ctx.out.note(`job ${result.jobId}`);
        // Saying this plainly beats a progress bar that cannot know anything.
        ctx.out.note(
          `${theme.dim("tl;dv exposes no endpoint to poll that job.")} Watch for it with \`tldv ls --limit 5\`.`,
        );
      } catch (error) {
        spinner.stop();
        throw error;
      }
    });
}

function assertUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new UsageError(`${JSON.stringify(value)} is not a URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UsageError("The media URL must be http or https.");
  }
}

function parseHappenedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new UsageError(`--at expects an ISO 8601 timestamp, got ${JSON.stringify(value)}.`);
  }
  return parsed.toISOString();
}

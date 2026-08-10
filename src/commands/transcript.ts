import { resolve } from "node:path";
import { Command } from "commander";

import type { Meeting } from "../api/types.js";
import { createContext } from "../context.js";
import { ExitCode, TldvError, UsageError } from "../core/errors.js";
import { defaultFilename } from "../core/filenames.js";
import { resolveMeeting, resolveMeetingId } from "../core/resolve-meeting.js";
import {
  formatTranscript,
  isTranscriptFormat,
  TRANSCRIPT_FORMATS,
  type TranscriptFormat,
} from "../formats/transcript.js";
import { isDirectory } from "../ui/output.js";
import { createSpinner } from "../ui/spinner.js";

interface TranscriptOptions {
  format: string;
  out?: string;
  speakers?: boolean;
  timestamps?: boolean;
  everyone?: boolean;
}

export function transcriptCommand(): Command {
  return new Command("transcript")
    .alias("tr")
    .description("print or save a meeting transcript")
    .argument("<meeting>", "meeting id, tl;dv URL, title, or `latest`")
    .option("-f, --format <format>", `one of ${TRANSCRIPT_FORMATS.join(", ")}`, "txt")
    .option("-o, --out <path>", "write to a file or directory; omit for stdout")
    .option("--no-speakers", "drop speaker labels")
    .option("--no-timestamps", "drop inline timestamps (txt and md)")
    .option("--everyone", "search meetings you did not attend when resolving a title")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  tldv transcript latest                       print the last meeting to stdout",
        "  tldv transcript latest -f srt -o ./subs/     subtitles, auto-named by date and title",
        "  tldv transcript https://tldv.io/app/meetings/abc123 > notes.txt",
      ].join("\n"),
    )
    .action(async (input: string, options: TranscriptOptions, self: Command) => {
      // Argument validation first: a typo in --format should not read "no API key".
      const format = parseFormat(options.format);
      const ctx = createContext(self);

      // Metadata costs an extra request, so only fetch it when the output actually needs it:
      // the markdown header, or a generated filename.
      const wantsGeneratedName =
        options.out !== undefined &&
        options.out !== "-" &&
        (/[\\/]$/.test(options.out) || isDirectory(resolve(options.out)));
      const needsMeeting = format === "md" || wantsGeneratedName;

      const spinner = createSpinner("Fetching transcript…", ctx.out.isInteractive);
      let meeting: Meeting | undefined;
      let meetingId: string;
      try {
        if (needsMeeting) {
          meeting = await resolveMeeting(ctx, input, { onlyParticipated: !options.everyone });
          meetingId = meeting.id;
        } else {
          meetingId = await resolveMeetingId(ctx, input, { onlyParticipated: !options.everyone });
        }

        const transcript = await ctx.api.getTranscript(meetingId);
        spinner.stop();

        if (transcript.sentences.length === 0) {
          throw new TldvError("That meeting has no transcript yet.", {
            exitCode: ExitCode.notFound,
            hint: "tl;dv produces transcripts after processing; try again once the recording finishes.",
          });
        }

        const content = formatTranscript(transcript, meeting, format, {
          speakers: options.speakers !== false,
          timestamps: options.timestamps !== false,
        });

        const fallbackName = meeting ? defaultFilename(meeting, format) : `${meetingId}.${format}`;
        const target = ctx.out.resolveTarget(options.out, fallbackName);
        ctx.out.write(target, content);

        if (target.kind === "file") {
          const lines = transcript.sentences.length;
          ctx.out.success(`${target.path} (${lines} line${lines === 1 ? "" : "s"})`);
        }
      } finally {
        spinner.stop();
      }
    });
}

function parseFormat(value: string): TranscriptFormat {
  const normalized = value.trim().toLowerCase();
  if (!isTranscriptFormat(normalized)) {
    throw new UsageError(
      `Unknown --format ${JSON.stringify(value)}.`,
      `Choose one of: ${TRANSCRIPT_FORMATS.join(", ")}`,
    );
  }
  return normalized;
}

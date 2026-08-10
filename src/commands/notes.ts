import { resolve } from "node:path";
import { Command } from "commander";

import type { Meeting } from "../api/types.js";
import { createContext } from "../context.js";
import { ExitCode, TldvError } from "../core/errors.js";
import { defaultFilename } from "../core/filenames.js";
import { resolveMeeting, resolveMeetingId } from "../core/resolve-meeting.js";
import { isDirectory } from "../ui/output.js";
import { createSpinner } from "../ui/spinner.js";

interface NotesOptions {
  out?: string;
  json?: boolean;
  everyone?: boolean;
}

export function notesCommand(): Command {
  return new Command("notes")
    .description("print or save a meeting's AI notes as Markdown")
    .argument("<meeting>", "meeting id, tl;dv URL, title, or `latest`")
    .option("-o, --out <path>", "write to a file or directory; omit for stdout")
    .option("--everyone", "search meetings you did not attend when resolving a title")
    .option("--json", "print the raw API payload, including topics and magic pins")
    .action(async (input: string, options: NotesOptions, self: Command) => {
      const ctx = createContext(self);

      const wantsGeneratedName =
        options.out !== undefined &&
        options.out !== "-" &&
        (/[\\/]$/.test(options.out) || isDirectory(resolve(options.out)));

      const spinner = createSpinner("Fetching notes…", ctx.out.isInteractive);
      try {
        let meeting: Meeting | undefined;
        let meetingId: string;
        if (wantsGeneratedName) {
          meeting = await resolveMeeting(ctx, input, { onlyParticipated: !options.everyone });
          meetingId = meeting.id;
        } else {
          meetingId = await resolveMeetingId(ctx, input, { onlyParticipated: !options.everyone });
        }

        const notes = await ctx.api.getNotes(meetingId);
        spinner.stop();

        if (options.json) {
          ctx.out.json(notes.raw);
          return;
        }

        if (!notes.markdown.trim()) {
          throw new TldvError("That meeting has no notes yet.", {
            exitCode: ExitCode.notFound,
            hint: "Notes appear after tl;dv finishes processing. `--json` shows the raw payload.",
          });
        }

        // `.notes.md`, not `.md`: a transcript exported as markdown would otherwise overwrite
        // the notes when both land in the same directory. `tldv export` names them the same way.
        const fallbackName = meeting
          ? defaultFilename(meeting, "notes.md")
          : `${meetingId}.notes.md`;
        const target = ctx.out.resolveTarget(options.out, fallbackName);
        ctx.out.write(
          target,
          notes.markdown.endsWith("\n") ? notes.markdown : `${notes.markdown}\n`,
        );

        if (target.kind === "file") {
          const topics = notes.topics.length;
          const suffix = topics > 0 ? ` (${topics} topic${topics === 1 ? "" : "s"})` : "";
          ctx.out.success(`${target.path}${suffix}`);
        }
      } finally {
        spinner.stop();
      }
    });
}

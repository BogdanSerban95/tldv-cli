import { existsSync, mkdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { Command } from "commander";

import { createContext } from "../context.js";
import { TldvError } from "../core/errors.js";
import { defaultFilename } from "../core/filenames.js";
import { resolveMeeting, resolveMeetingId } from "../core/resolve-meeting.js";
import { humanBytes } from "../ui/output.js";
import { createSpinner } from "../ui/spinner.js";

interface DownloadOptions {
  out?: string;
  urlOnly?: boolean;
  force?: boolean;
  everyone?: boolean;
}

export function downloadCommand(): Command {
  return new Command("download")
    .alias("dl")
    .description("download a meeting recording")
    .argument("<meeting>", "meeting id, tl;dv URL, title, or `latest`")
    .option("-o, --out <path>", "target file or directory (default: current directory)")
    .option("--url-only", "print the signed URL instead of downloading (expires in 6 hours)")
    .option("--force", "overwrite an existing file")
    .option("--everyone", "search meetings you did not attend when resolving a title")
    .action(async (input: string, options: DownloadOptions, self: Command) => {
      const ctx = createContext(self);

      if (options.urlOnly) {
        const meetingId = await resolveMeetingId(ctx, input, {
          onlyParticipated: !options.everyone,
        });
        ctx.out.line(await ctx.api.getDownloadUrl(meetingId));
        return;
      }

      const meeting = await resolveMeeting(ctx, input, { onlyParticipated: !options.everyone });
      const spinner = createSpinner("Requesting download URL…", ctx.out.isInteractive);

      try {
        const url = await ctx.api.getDownloadUrl(meeting.id);
        const extension = extensionFromUrl(url);
        const target = ctx.out.resolveTarget(
          options.out ?? ".",
          defaultFilename(meeting, extension),
        );
        if (target.kind === "stdout") {
          throw new TldvError("Recordings cannot be streamed to stdout.", {
            hint: "Give a path with -o, or use --url-only and pipe that into curl.",
          });
        }

        const path = resolve(target.path);
        if (existsSync(path) && !options.force) {
          throw new TldvError(`${path} already exists.`, { hint: "Pass --force to overwrite." });
        }
        mkdirSync(dirname(path), { recursive: true });

        spinner.update("Downloading…");
        const { bytes } = await ctx.api.downloadFromUrl(
          url,
          path,
          ({ receivedBytes, totalBytes }) => {
            const progress = totalBytes
              ? `${humanBytes(receivedBytes)} / ${humanBytes(totalBytes)} (${Math.round((receivedBytes / totalBytes) * 100)}%)`
              : humanBytes(receivedBytes);
            spinner.update(`Downloading… ${progress}`);
          },
        );

        // Not spinner.succeed: the spinner is a no-op off a TTY, and a download that writes
        // a 45 MB file deserves a confirmation line in a log too.
        spinner.stop();
        ctx.out.success(`${path} (${humanBytes(bytes)})`);
      } catch (error) {
        spinner.stop();
        throw error;
      }
    });
}

/** Signed URLs carry the real container; fall back to mp4, which is what tl;dv serves. */
function extensionFromUrl(url: string): string {
  try {
    const extension = extname(new URL(url).pathname).replace(/^\./, "");
    return /^[a-z0-9]{2,4}$/i.test(extension) ? extension.toLowerCase() : "mp4";
  } catch {
    return "mp4";
  }
}

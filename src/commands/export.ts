import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { Command } from "commander";

import type { Meeting } from "../api/types.js";
import { type Context, createContext, positiveInt } from "../context.js";
import { dateKey } from "../core/dates.js";
import { ApiError, TldvError, UsageError } from "../core/errors.js";
import { slugify } from "../core/filenames.js";
import { mapPool } from "../core/pool.js";
import {
  formatTranscript,
  isTranscriptFormat,
  TRANSCRIPT_FORMATS,
  type TranscriptFormat,
} from "../formats/transcript.js";
import { createSpinner } from "../ui/spinner.js";
import { theme } from "../ui/theme.js";
import { addFilterOptions, buildListParams, type FilterOptions } from "./shared.js";

const MANIFEST_NAME = "manifest.json";
const MANIFEST_VERSION = 1;

interface ExportOptions extends FilterOptions {
  outDir: string;
  format: string;
  notes?: boolean;
  video?: boolean;
  limit?: string;
  concurrency?: string;
  skipExisting?: boolean;
  dryRun?: boolean;
}

interface ManifestEntry {
  id: string;
  name: string;
  happenedAt: string | undefined;
  files: string[];
  exportedAt: string;
}

interface Manifest {
  version: number;
  updatedAt: string;
  meetings: Record<string, ManifestEntry>;
}

interface MeetingOutcome {
  meeting: Meeting;
  written: string[];
  skipped: boolean;
  /** Present when the meeting exists but had nothing to export. */
  empty?: string;
}

export function exportCommand(): Command {
  const command = new Command("export")
    .description("bulk-export transcripts, notes, and recordings to a directory")
    .option("-d, --out-dir <dir>", "destination directory", "./tldv-export")
    .option(
      "-f, --format <list>",
      `transcript formats, comma-separated (${TRANSCRIPT_FORMATS.join(", ")})`,
      "md",
    )
    .option("--notes", "also write each meeting's AI notes as <name>.notes.md")
    .option("--video", "also download each recording (large)")
    .option("-n, --limit <count>", "maximum meetings to export", "100")
    .option("-c, --concurrency <count>", "meetings processed in parallel", "4")
    .option("--skip-existing", "leave meetings alone when their files are already on disk")
    .option("--dry-run", "list what would be written without calling the transcript API")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  tldv export --from 30d -f md,srt --notes -d ./meetings",
        "  tldv export --from 2026-01-01 --skip-existing        re-runnable incremental sync",
      ].join("\n"),
    );

  addFilterOptions(command).action(async (options: ExportOptions, self: Command) => {
    // Argument validation first: a typo in --format should not read "no API key".
    const formats = parseFormats(options.format);
    const limit = positiveInt(options.limit, 100, "--limit");
    const concurrency = positiveInt(options.concurrency, 4, "--concurrency");
    const outDir = resolve(options.outDir);
    const ctx = createContext(self);

    const meetings = await collectMeetings(ctx, options, limit);
    if (meetings.length === 0) {
      ctx.out.warn("No meetings match those filters.");
      return;
    }

    if (options.dryRun) {
      previewPlan(ctx, meetings, outDir, formats, options);
      return;
    }

    mkdirSync(outDir, { recursive: true });
    const manifest = readManifest(outDir);

    const spinner = createSpinner(`Exporting 0/${meetings.length}…`, ctx.out.isInteractive);
    let done = 0;

    const results = await mapPool(meetings, concurrency, async (meeting) => {
      const outcome = await exportMeeting(ctx, meeting, {
        outDir,
        formats,
        notes: options.notes === true,
        video: options.video === true,
        skipExisting: options.skipExisting === true,
        manifest,
      });
      spinner.update(`Exporting ${++done}/${meetings.length}… ${meeting.name}`);
      return outcome;
    });

    spinner.stop();

    const failures: { meeting: Meeting; error: unknown }[] = [];
    let exported = 0;
    let skipped = 0;
    const empties: string[] = [];

    results.forEach((result, index) => {
      const meeting = meetings[index]!;
      if (!result.ok) {
        failures.push({ meeting, error: result.error });
        return;
      }
      if (result.value.skipped) skipped += 1;
      else if (result.value.written.length > 0) exported += 1;
      if (result.value.empty) empties.push(`${meeting.name}: ${result.value.empty}`);

      if (result.value.written.length > 0) {
        manifest.meetings[meeting.id] = {
          id: meeting.id,
          name: meeting.name,
          happenedAt: meeting.happenedAt?.toISOString(),
          files: mergeFiles(manifest.meetings[meeting.id]?.files, result.value.written),
          exportedAt: new Date().toISOString(),
        };
      }
    });

    writeManifest(outDir, manifest);

    for (const message of empties) ctx.out.note(`${theme.dim("no content")} ${message}`);
    for (const failure of failures) {
      ctx.out.error(`${failure.meeting.name}: ${errorText(failure.error)}`);
    }

    ctx.out.success(
      `${exported} exported, ${skipped} unchanged, ${failures.length} failed → ${outDir}`,
    );

    if (failures.length > 0) {
      throw new TldvError(`${failures.length} meeting(s) failed to export.`, {
        hint: "Re-run with --skip-existing to retry only what is missing.",
      });
    }
  });

  return command;
}

async function collectMeetings(
  ctx: Context,
  options: ExportOptions,
  limit: number,
): Promise<Meeting[]> {
  const params = buildListParams(options);
  const spinner = createSpinner("Listing meetings…", ctx.out.isInteractive);
  const meetings: Meeting[] = [];
  let total = 0;

  try {
    for await (const meeting of ctx.api.iterateMeetings(
      { ...params, limit: 100 },
      {
        max: limit,
        onPage: (page) => {
          total = page.total;
          spinner.update(`Listing meetings… ${meetings.length}/${Math.min(page.total, limit)}`);
        },
        onCapped: (count) =>
          ctx.out.warn(
            `${count.toLocaleString()} meetings match; tl;dv stops paging at 10,000. Narrow --from/--to.`,
          ),
      },
    )) {
      meetings.push(meeting);
    }
  } finally {
    spinner.stop();
  }

  // Never let a --limit truncation pass silently: it looks identical to "that was all of them".
  if (total > meetings.length) {
    ctx.out.warn(
      `${total.toLocaleString()} meetings match; exporting the ${meetings.length} most recent. Raise --limit or narrow --from.`,
    );
  }
  return meetings;
}

async function exportMeeting(
  ctx: Context,
  meeting: Meeting,
  config: {
    outDir: string;
    formats: TranscriptFormat[];
    notes: boolean;
    video: boolean;
    skipExisting: boolean;
    manifest: Manifest;
  },
): Promise<MeetingOutcome> {
  const base = baseName(meeting);
  const transcriptTargets = config.formats.map((format) => ({
    format,
    path: join(config.outDir, `${base}.${format}`),
  }));
  const notesPath = join(config.outDir, `${base}.notes.md`);

  const pendingTranscripts = config.skipExisting
    ? transcriptTargets.filter((target) => !existsSync(target.path))
    : transcriptTargets;
  const needsNotes = config.notes && !(config.skipExisting && existsSync(notesPath));
  const needsVideo =
    config.video && !(config.skipExisting && hasVideo(config.manifest, meeting.id));

  if (pendingTranscripts.length === 0 && !needsNotes && !needsVideo) {
    return { meeting, written: [], skipped: true };
  }

  const written: string[] = [];
  let empty: string | undefined;

  if (pendingTranscripts.length > 0) {
    const transcript = await ctx.api.getTranscript(meeting.id).catch(swallowNotFound);
    if (transcript && transcript.sentences.length > 0) {
      for (const target of pendingTranscripts) {
        writeFileSync(target.path, formatTranscript(transcript, meeting, target.format), "utf8");
        written.push(basename(target.path));
      }
    } else {
      empty = "no transcript";
    }
  }

  if (needsNotes) {
    const notes = await ctx.api.getNotes(meeting.id).catch(swallowNotFound);
    if (notes?.markdown.trim()) {
      writeFileSync(notesPath, ensureNewline(notes.markdown), "utf8");
      written.push(basename(notesPath));
    } else {
      empty = empty ? `${empty}, no notes` : "no notes";
    }
  }

  if (needsVideo) {
    const url = await ctx.api.getDownloadUrl(meeting.id);
    const extension = videoExtension(url);
    const videoPath = join(config.outDir, `${base}.${extension}`);
    if (!existsSync(videoPath) || !config.skipExisting) {
      await ctx.api.downloadFromUrl(url, videoPath);
    }
    written.push(basename(videoPath));
  }

  const outcome: MeetingOutcome = { meeting, written, skipped: false };
  if (empty) outcome.empty = empty;
  return outcome;
}

function previewPlan(
  ctx: Context,
  meetings: Meeting[],
  outDir: string,
  formats: TranscriptFormat[],
  options: ExportOptions,
): void {
  ctx.out.info(`${meetings.length} meetings → ${outDir}`);
  for (const meeting of meetings) {
    const base = baseName(meeting);
    const files = formats.map((format) => `${base}.${format}`);
    if (options.notes) files.push(`${base}.notes.md`);
    if (options.video) files.push(`${base}.<video>`);
    ctx.out.line(files.join("\n"));
  }
  ctx.out.note("--dry-run: nothing was written.");
}

function baseName(meeting: Meeting): string {
  const prefix = meeting.happenedAt ? dateKey(meeting.happenedAt) : "undated";
  return `${prefix}-${slugify(meeting.name)}`;
}

function parseFormats(raw: string): TranscriptFormat[] {
  const parts = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) throw new UsageError("--format needs at least one value.");

  const formats: TranscriptFormat[] = [];
  for (const part of parts) {
    if (!isTranscriptFormat(part)) {
      throw new UsageError(
        `Unknown format ${JSON.stringify(part)}.`,
        `Choose from: ${TRANSCRIPT_FORMATS.join(", ")}`,
      );
    }
    if (!formats.includes(part)) formats.push(part);
  }
  return formats;
}

/** A meeting without a transcript is a normal state, not an export failure. */
function swallowNotFound(error: unknown): undefined {
  if (error instanceof ApiError && error.status === 404) return undefined;
  throw error;
}

function videoExtension(url: string): string {
  try {
    const match = /\.([a-z0-9]{2,4})(?:$|\?)/i.exec(new URL(url).pathname);
    return match ? match[1]!.toLowerCase() : "mp4";
  } catch {
    return "mp4";
  }
}

function hasVideo(manifest: Manifest, meetingId: string): boolean {
  const files = manifest.meetings[meetingId]?.files ?? [];
  return files.some((file) => /\.(mp4|mkv|mov|webm|m4a|mp3)$/i.test(file));
}

function mergeFiles(previous: string[] | undefined, added: string[]): string[] {
  return [...new Set([...(previous ?? []), ...added])].sort();
}

function ensureNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function readManifest(outDir: string): Manifest {
  const path = join(outDir, MANIFEST_NAME);
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed === "object") {
      const record = parsed as Partial<Manifest>;
      if (record.meetings && typeof record.meetings === "object") {
        return {
          version: MANIFEST_VERSION,
          updatedAt: new Date().toISOString(),
          meetings: record.meetings as Record<string, ManifestEntry>,
        };
      }
    }
  } catch {
    // No manifest yet, or an unreadable one: start fresh rather than refusing to export.
  }
  return { version: MANIFEST_VERSION, updatedAt: new Date().toISOString(), meetings: {} };
}

function writeManifest(outDir: string, manifest: Manifest): void {
  manifest.updatedAt = new Date().toISOString();
  writeFileSync(join(outDir, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

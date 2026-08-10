import { userLabel } from "../api/normalize.js";
import type { Meeting, Sentence, Transcript } from "../api/types.js";
import { formatDateTime, humanizeDuration } from "../core/dates.js";
import { clock, srtTime, vttTime } from "./time.js";

export const TRANSCRIPT_FORMATS = ["txt", "md", "srt", "vtt", "csv", "json"] as const;
export type TranscriptFormat = (typeof TRANSCRIPT_FORMATS)[number];

export function isTranscriptFormat(value: string): value is TranscriptFormat {
  return (TRANSCRIPT_FORMATS as readonly string[]).includes(value);
}

export interface FormatOptions {
  /** Prefix each block or cue with the speaker. */
  speakers?: boolean;
  /** Inline `[hh:mm:ss]` markers in txt and md. */
  timestamps?: boolean;
}

interface Block {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

/**
 * Merges runs of consecutive sentences from one speaker into a paragraph.
 *
 * tl;dv emits one entry per utterance, so an unmerged transcript is a wall of one-line
 * fragments. Subtitle formats skip this: a cue needs its own timing.
 */
export function groupBySpeaker(sentences: readonly Sentence[]): Block[] {
  const blocks: Block[] = [];
  for (const sentence of sentences) {
    if (!sentence.text) continue;
    const previous = blocks.at(-1);
    if (previous && previous.speaker === sentence.speaker) {
      previous.text = `${previous.text} ${sentence.text}`.trim();
      previous.end = Math.max(previous.end, sentence.end);
    } else {
      blocks.push({
        speaker: sentence.speaker,
        start: sentence.start,
        end: sentence.end,
        text: sentence.text,
      });
    }
  }
  return blocks;
}

export function extensionFor(format: TranscriptFormat): string {
  return format;
}

export function formatTranscript(
  transcript: Transcript,
  meeting: Meeting | undefined,
  format: TranscriptFormat,
  options: FormatOptions = {},
): string {
  const speakers = options.speakers ?? true;
  const timestamps = options.timestamps ?? true;

  switch (format) {
    case "json":
      return `${JSON.stringify(transcript.raw, null, 2)}\n`;
    case "csv":
      return toCsv(transcript.sentences);
    case "srt":
      return toSrt(transcript.sentences, speakers);
    case "vtt":
      return toVtt(transcript.sentences, speakers);
    case "md":
      return toMarkdown(transcript, meeting, { speakers, timestamps });
    case "txt":
      return toText(transcript.sentences, { speakers, timestamps });
  }
}

function toText(sentences: readonly Sentence[], options: Required<FormatOptions>): string {
  const blocks = groupBySpeaker(sentences).map((block) => {
    const prefix = [
      options.timestamps ? `[${clock(block.start)}]` : "",
      options.speakers ? `${block.speaker}:` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return prefix ? `${prefix} ${block.text}` : block.text;
  });
  return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : "";
}

function toMarkdown(
  transcript: Transcript,
  meeting: Meeting | undefined,
  options: Required<FormatOptions>,
): string {
  const lines: string[] = [];

  if (meeting) {
    lines.push(`# ${meeting.name}`, "");
    if (meeting.happenedAt) lines.push(`- **Date:** ${formatDateTime(meeting.happenedAt)}`);
    if (meeting.duration > 0) lines.push(`- **Duration:** ${humanizeDuration(meeting.duration)}`);
    lines.push(`- **Organizer:** ${userLabel(meeting.organizer)}`);
    if (meeting.invitees.length > 0) {
      lines.push(`- **Participants:** ${meeting.invitees.map(userLabel).join(", ")}`);
    }
    if (meeting.url) lines.push(`- **Recording:** ${meeting.url}`);
    lines.push("", "---", "");
  }

  for (const block of groupBySpeaker(transcript.sentences)) {
    const heading = [
      options.speakers ? `**${block.speaker}**` : "",
      options.timestamps ? `\`${clock(block.start)}\`` : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (heading) lines.push(heading, "");
    lines.push(block.text, "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/** Cues need a positive duration or players drop them. */
function cueEnd(sentence: Sentence): number {
  return sentence.end > sentence.start ? sentence.end : sentence.start + 1;
}

function cueText(sentence: Sentence, speakers: boolean): string {
  return speakers && sentence.speaker ? `${sentence.speaker}: ${sentence.text}` : sentence.text;
}

function toSrt(sentences: readonly Sentence[], speakers: boolean): string {
  const cues = sentences.filter((sentence) => sentence.text);
  return cues
    .map((sentence, index) =>
      [
        String(index + 1),
        `${srtTime(sentence.start)} --> ${srtTime(cueEnd(sentence))}`,
        cueText(sentence, speakers),
        "",
      ].join("\n"),
    )
    .join("\n");
}

function toVtt(sentences: readonly Sentence[], speakers: boolean): string {
  const cues = sentences
    .filter((sentence) => sentence.text)
    .map((sentence) =>
      [
        `${vttTime(sentence.start)} --> ${vttTime(cueEnd(sentence))}`,
        cueText(sentence, speakers),
        "",
      ].join("\n"),
    );
  return `WEBVTT\n\n${cues.join("\n")}`;
}

function toCsv(sentences: readonly Sentence[]): string {
  const rows = [["start", "end", "speaker", "text"].join(",")];
  for (const sentence of sentences) {
    rows.push(
      [
        sentence.start.toFixed(3),
        sentence.end.toFixed(3),
        csvCell(sentence.speaker),
        csvCell(sentence.text),
      ].join(","),
    );
  }
  return `${rows.join("\n")}\n`;
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

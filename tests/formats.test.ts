import { describe, expect, it } from "vitest";

import type { Meeting, Sentence, Transcript } from "../src/api/types.js";
import { clock, srtTime, vttTime } from "../src/formats/time.js";
import { formatTranscript, groupBySpeaker } from "../src/formats/transcript.js";

function sentence(partial: Partial<Sentence>): Sentence {
  return { speaker: "Ana", text: "hello", start: 0, end: 1, ...partial };
}

function transcript(sentences: Sentence[]): Transcript {
  return { id: "t1", meetingId: "m1", sentences, raw: { id: "t1", data: sentences } };
}

const meeting: Meeting = {
  id: "m1",
  name: "Daily",
  happenedAt: new Date("2026-08-10T07:30:00.000Z"),
  url: "https://tldv.io/app/meetings/m1",
  duration: 1531,
  organizer: { name: "Ana", email: "ana@example.com" },
  invitees: [{ name: "Bo", email: "bo@example.com" }],
  raw: {},
};

describe("time formatting", () => {
  it("renders hours, minutes, seconds and milliseconds", () => {
    expect(clock(3723.4)).toBe("01:02:03");
    expect(srtTime(3723.456)).toBe("01:02:03,456");
    expect(vttTime(3723.456)).toBe("01:02:03.456");
  });

  it("clamps negative and non-finite input to zero", () => {
    expect(clock(-5)).toBe("00:00:00");
    expect(srtTime(Number.NaN)).toBe("00:00:00,000");
  });
});

describe("groupBySpeaker", () => {
  it("merges consecutive utterances from the same speaker", () => {
    const blocks = groupBySpeaker([
      sentence({ speaker: "Ana", text: "one", start: 0, end: 1 }),
      sentence({ speaker: "Ana", text: "two", start: 1, end: 2 }),
      sentence({ speaker: "Bo", text: "three", start: 2, end: 3 }),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ speaker: "Ana", text: "one two", start: 0, end: 2 });
    expect(blocks[1]).toMatchObject({ speaker: "Bo", text: "three" });
  });

  it("drops empty utterances", () => {
    expect(groupBySpeaker([sentence({ text: "" })])).toHaveLength(0);
  });
});

describe("formatTranscript", () => {
  const sample = transcript([
    sentence({ speaker: "Ana", text: "Morning.", start: 0, end: 2 }),
    sentence({ speaker: "Bo", text: "Morning!", start: 2.5, end: 4 }),
  ]);

  it("writes txt with timestamps and speakers", () => {
    expect(formatTranscript(sample, undefined, "txt")).toBe(
      "[00:00:00] Ana: Morning.\n\n[00:00:02] Bo: Morning!\n",
    );
  });

  it("honours --no-speakers and --no-timestamps", () => {
    expect(formatTranscript(sample, undefined, "txt", { speakers: false, timestamps: false })).toBe(
      "Morning.\n\nMorning!\n",
    );
  });

  it("puts meeting metadata in the markdown header", () => {
    const output = formatTranscript(sample, meeting, "md");
    expect(output).toContain("# Daily");
    expect(output).toContain("- **Participants:** Bo");
    expect(output).toContain("**Ana** `00:00:00`");
  });

  it("numbers srt cues and keeps them unmerged", () => {
    expect(formatTranscript(sample, undefined, "srt")).toBe(
      "1\n00:00:00,000 --> 00:00:02,000\nAna: Morning.\n\n2\n00:00:02,500 --> 00:00:04,000\nBo: Morning!\n",
    );
  });

  it("starts vtt with the required header", () => {
    expect(formatTranscript(sample, undefined, "vtt").startsWith("WEBVTT\n\n")).toBe(true);
  });

  it("gives a zero-length cue a positive duration", () => {
    const degenerate = transcript([sentence({ text: "hi", start: 5, end: 5 })]);
    expect(formatTranscript(degenerate, undefined, "srt")).toContain(
      "00:00:05,000 --> 00:00:06,000",
    );
  });

  it("quotes csv cells containing separators", () => {
    const tricky = transcript([
      sentence({ speaker: "Ana", text: 'said "go, now"', start: 0, end: 1 }),
    ]);
    expect(formatTranscript(tricky, undefined, "csv")).toBe(
      'start,end,speaker,text\n0.000,1.000,Ana,"said ""go, now"""\n',
    );
  });

  it("emits the untouched payload for json", () => {
    expect(JSON.parse(formatTranscript(sample, undefined, "json"))).toEqual(sample.raw);
  });
});

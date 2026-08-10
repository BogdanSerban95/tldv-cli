import { describe, expect, it } from "vitest";

import {
  parseMeeting,
  parseMeetingPage,
  parseNotes,
  parseTranscript,
} from "../src/api/normalize.js";

/** Trimmed from a real `GET /v1alpha1/meetings` response. */
const liveMeeting = {
  id: "6a797dea9dc4710013576595",
  name: "Brain-Waves | Daily",
  happenedAt: "2026-08-10T07:30:00.000Z",
  url: "https://tldv.io/app/meetings/6a797dea9dc4710013576595",
  organizer: {
    id: "69788ee987a2320013eadbef",
    name: "Ana",
    email: "ana@example.com",
    domain: "example.com",
  },
  invitees: [{ id: "1", name: "", email: "bo@other.com", domain: "other.com" }],
  status: "successful",
  duration: 1531,
};

describe("parseMeeting", () => {
  it("keeps fields the published spec omits", () => {
    const meeting = parseMeeting(liveMeeting);
    expect(meeting.status).toBe("successful");
    expect(meeting.organizer.domain).toBe("example.com");
    expect(meeting.invitees[0]?.id).toBe("1");
  });

  it("parses a live payload that lacks the spec's required template and extraProperties", () => {
    const meeting = parseMeeting(liveMeeting);
    expect(meeting.id).toBe(liveMeeting.id);
    expect(meeting.happenedAt?.toISOString()).toBe("2026-08-10T07:30:00.000Z");
    expect(meeting.duration).toBe(1531);
  });

  it("survives a payload with nothing in it", () => {
    const meeting = parseMeeting({});
    expect(meeting.name).toBe("(untitled)");
    expect(meeting.duration).toBe(0);
    expect(meeting.invitees).toEqual([]);
    expect(meeting.happenedAt).toBeUndefined();
  });

  it("preserves the raw payload for --json", () => {
    expect(parseMeeting(liveMeeting).raw).toEqual(liveMeeting);
  });
});

describe("parseMeetingPage", () => {
  it("reads pagination metadata", () => {
    const page = parseMeetingPage({
      page: 1,
      pages: 99,
      total: 197,
      pageSize: 2,
      results: [liveMeeting],
    });
    expect(page).toMatchObject({ page: 1, pages: 99, total: 197, pageSize: 2 });
    expect(page.results).toHaveLength(1);
  });

  it("falls back to the result count when totals are missing", () => {
    expect(parseMeetingPage({ results: [liveMeeting] }).total).toBe(1);
  });
});

describe("parseTranscript", () => {
  it("maps startTime and endTime to seconds", () => {
    const transcript = parseTranscript({
      id: "t",
      meetingId: "m",
      data: [{ speaker: "Ana", text: " hi ", startTime: 1.5, endTime: 2.5 }],
    });
    expect(transcript.sentences[0]).toEqual({ speaker: "Ana", text: "hi", start: 1.5, end: 2.5 });
  });

  it("defaults a missing speaker rather than dropping the line", () => {
    const transcript = parseTranscript({ data: [{ text: "hi", startTime: 0 }] });
    expect(transcript.sentences[0]).toMatchObject({ speaker: "Unknown", end: 0 });
  });
});

describe("parseNotes", () => {
  it("reads markdown, structured notes and topics", () => {
    const notes = parseNotes({
      markdownContent: "# Notes",
      structuredNotes: [{ segmentId: "s", timestamp: 12, text: "point", topicId: "t" }],
      topics: [{ id: "t", order: 1, title: "Intro", summary: "..." }],
    });
    expect(notes.markdown).toBe("# Notes");
    expect(notes.structured).toHaveLength(1);
    expect(notes.topics[0]?.title).toBe("Intro");
  });
});

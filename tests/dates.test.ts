import { describe, expect, it } from "vitest";

import { formatRelative, humanizeDuration, parseDateInput } from "../src/core/dates.js";
import { UsageError } from "../src/core/errors.js";

const now = new Date("2026-08-10T12:00:00.000Z");

describe("parseDateInput", () => {
  it("expands a bare date to the start of the day for --from", () => {
    expect(parseDateInput("2026-07-01", "from", now)).toBe("2026-07-01T00:00:00.000Z");
  });

  it("expands a bare date to the end of the day for --to, so that day is included", () => {
    expect(parseDateInput("2026-07-31", "to", now)).toBe("2026-07-31T23:59:59.999Z");
  });

  it("reads relative offsets into the past", () => {
    expect(parseDateInput("24h", "from", now)).toBe("2026-08-09T12:00:00.000Z");
    expect(parseDateInput("30d", "from", now)).toBe("2026-07-11T12:00:00.000Z");
    expect(parseDateInput("2w", "from", now)).toBe("2026-07-27T12:00:00.000Z");
    expect(parseDateInput("1y", "from", now)).toBe("2025-08-10T12:00:00.000Z");
  });

  it("passes a full ISO timestamp through", () => {
    expect(parseDateInput("2026-03-04T05:06:07Z", "from", now)).toBe("2026-03-04T05:06:07.000Z");
  });

  it("rejects nonsense with a usage error", () => {
    expect(() => parseDateInput("last tuesday", "from", now)).toThrow(UsageError);
    expect(() => parseDateInput("", "to", now)).toThrow(UsageError);
  });
});

describe("humanizeDuration", () => {
  it("drops empty leading units", () => {
    expect(humanizeDuration(31)).toBe("31s");
    expect(humanizeDuration(1531)).toBe("25m 31s");
    expect(humanizeDuration(3723)).toBe("1h 02m");
  });

  it("treats missing or negative durations as zero", () => {
    expect(humanizeDuration(0)).toBe("0s");
    expect(humanizeDuration(-10)).toBe("0s");
  });
});

describe("formatRelative", () => {
  it("scales the unit to the distance", () => {
    expect(formatRelative(new Date("2026-08-10T11:59:30Z"), now)).toBe("just now");
    expect(formatRelative(new Date("2026-08-10T09:00:00Z"), now)).toBe("3h ago");
    expect(formatRelative(new Date("2026-08-07T12:00:00Z"), now)).toBe("3d ago");
    expect(formatRelative(new Date("2026-05-10T12:00:00Z"), now)).toBe("3mo ago");
  });
});

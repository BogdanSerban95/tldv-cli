import { describe, expect, it } from "vitest";

import { defaultFilename, slugify } from "../src/core/filenames.js";
import { mapPool } from "../src/core/pool.js";
import { extractMeetingId } from "../src/core/resolve-meeting.js";
import { humanBytes } from "../src/ui/output.js";
import { renderTable, truncate } from "../src/ui/table.js";

describe("extractMeetingId", () => {
  it("takes a bare object id", () => {
    expect(extractMeetingId("6a797dea9dc4710013576595")).toBe("6a797dea9dc4710013576595");
  });

  it("pulls the id out of a pasted tl;dv URL, timestamp fragment and all", () => {
    expect(extractMeetingId("https://tldv.io/app/meetings/6a797dea9dc4710013576595?t=42")).toBe(
      "6a797dea9dc4710013576595",
    );
  });

  it("returns nothing for a title, which then goes to search", () => {
    expect(extractMeetingId("Brain-Waves | Daily")).toBeUndefined();
    expect(extractMeetingId("latest")).toBeUndefined();
  });
});

describe("slugify", () => {
  it("folds diacritics and punctuation", () => {
    expect(slugify("Demo licitații publice la TOTALMED")).toBe(
      "demo-licitatii-publice-la-totalmed",
    );
    expect(slugify("Brain-Waves | Daily")).toBe("brain-waves-daily");
  });

  it("falls back when a name has nothing usable", () => {
    expect(slugify("…")).toBe("meeting");
  });

  it("cuts long names on a word boundary", () => {
    const slug = slugify("one two three four five six seven eight nine ten eleven twelve", 30);
    expect(slug.length).toBeLessThanOrEqual(30);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("defaultFilename", () => {
  it("prefixes with the meeting date so files sort chronologically", () => {
    expect(
      defaultFilename({ name: "Daily", happenedAt: new Date(2026, 7, 10, 9, 30), id: "m1" }, "srt"),
    ).toBe("2026-08-10-daily.srt");
  });

  it("marks undated meetings rather than guessing", () => {
    expect(defaultFilename({ name: "Daily", happenedAt: undefined, id: "m1" }, "md")).toBe(
      "undated-daily.md",
    );
  });
});

describe("mapPool", () => {
  it("respects the concurrency ceiling", async () => {
    let active = 0;
    let peak = 0;
    await mapPool([1, 2, 3, 4, 5, 6], 2, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("captures a failure per item instead of aborting the batch", async () => {
    const results = await mapPool([1, 2, 3], 2, async (value) => {
      if (value === 2) throw new Error("boom");
      return value * 10;
    });
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(results[0]).toEqual({ ok: true, value: 10 });
    expect(results[2]).toEqual({ ok: true, value: 30 });
  });
});

describe("table", () => {
  it("truncates with an ellipsis", () => {
    expect(truncate("abcdefgh", 4)).toBe("abc…");
    expect(truncate("abc", 10)).toBe("abc");
  });

  it("shrinks the flex column to fit the terminal", () => {
    const output = renderTable(
      [{ header: "WHEN" }, { header: "NAME", flex: true, minWidth: 6 }],
      [["2026-08-10", "a very long meeting name that will not fit"]],
      24,
    );
    for (const line of output.trimEnd().split("\n")) {
      expect(line.length).toBeLessThanOrEqual(24);
    }
  });
});

describe("humanBytes", () => {
  it("scales the unit", () => {
    expect(humanBytes(512)).toBe("512 B");
    expect(humanBytes(1536)).toBe("1.5 KB");
    expect(humanBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

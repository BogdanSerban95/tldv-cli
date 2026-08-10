import { describe, expect, it } from "vitest";

import { absolutizeLinks, prepareNotes } from "../src/formats/notes.js";

/** Real shape of a tl;dv note line, which links to a timestamp inside the web app. */
const line = "- [ ] Calin to send OCR model [03:01](/app/meetings/6a797dea9dc4710013576595?t=181)";

describe("absolutizeLinks", () => {
  it("rewrites root-relative timestamp links, which are dead in a saved file", () => {
    expect(absolutizeLinks(line)).toBe(
      "- [ ] Calin to send OCR model [03:01](https://tldv.io/app/meetings/6a797dea9dc4710013576595?t=181)",
    );
  });

  it("leaves absolute links alone", () => {
    const absolute = "[docs](https://example.com/a?b=1)";
    expect(absolutizeLinks(absolute)).toBe(absolute);
  });

  it("leaves anchors and relative-without-slash links alone", () => {
    expect(absolutizeLinks("[a](#section) [b](./other.md)")).toBe("[a](#section) [b](./other.md)");
  });
});

describe("prepareNotes", () => {
  it("ends the file with a newline", () => {
    expect(prepareNotes("# Notes")).toBe("# Notes\n");
    expect(prepareNotes("# Notes\n")).toBe("# Notes\n");
  });
});

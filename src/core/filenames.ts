import { dateKey } from "./dates.js";

const UNSAFE = /[^a-z0-9]+/gi;

export function slugify(input: string, maxLength = 60): string {
  const slug = input
    .normalize("NFKD")
    // Strip combining marks (U+0300-U+036F) so "Achiziție" becomes "achizitie".
    .replace(/[\u0300-\u036f]/g, "")
    .replace(UNSAFE, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!slug) return "meeting";
  if (slug.length <= maxLength) return slug;
  // Cut on a word boundary when one is close enough to the limit to look deliberate.
  const cut = slug.slice(0, maxLength);
  const lastDash = cut.lastIndexOf("-");
  return lastDash > maxLength * 0.6 ? cut.slice(0, lastDash) : cut;
}

/** `2026-08-10-brain-waves-daily.srt` — sortable by date, readable, collision-resistant enough. */
export function defaultFilename(
  meeting: { name: string; happenedAt: Date | undefined; id: string },
  extension: string,
): string {
  const prefix = meeting.happenedAt ? dateKey(meeting.happenedAt) : "undated";
  const slug = slugify(meeting.name);
  const ext = extension.replace(/^\./, "");
  return `${prefix}-${slug}.${ext}`;
}

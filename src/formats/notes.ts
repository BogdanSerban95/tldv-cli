const TLDV_WEB = "https://tldv.io";

/** `](/app/meetings/<id>?t=181)` → an absolute URL. */
const ROOT_RELATIVE_LINK = /\]\((\/[^)\s]*)\)/g;

/**
 * tl;dv writes timestamp links into its notes as root-relative paths, which resolve only
 * inside the web app. A saved file is read somewhere else, so they are rewritten absolute.
 */
export function absolutizeLinks(markdown: string): string {
  return markdown.replace(ROOT_RELATIVE_LINK, (_match, path: string) => `](${TLDV_WEB}${path})`);
}

export function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

export function prepareNotes(markdown: string): string {
  return ensureTrailingNewline(absolutizeLinks(markdown));
}

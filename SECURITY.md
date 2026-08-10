# Security

## Reporting a vulnerability

Open a [private security advisory](https://github.com/BogdanSerban95/tldv-cli/security/advisories/new).
Please do not open a public issue for anything that exposes credentials or meeting content.

## How this tool handles your API key

- The key is read from `TLDV_API_KEY` or `~/.config/tldv/config.json`, which is created with mode
  `0600` and re-chmodded on every write.
- There is no `--api-key` flag. Keys passed in argv are visible to every process on the machine via
  `ps` and are recorded in shell history.
- The key is only ever printed redacted, by `tldv auth status`.
- It is sent as the `x-api-key` header to the configured base URL over HTTPS, and to nothing else.
  Signed recording URLs are fetched without it.

## What the tool writes to disk

Transcripts, notes, and recordings you ask for, at the paths you name, plus `manifest.json` inside
an `export` directory. Meeting content is not sent anywhere other than tl;dv.

`TLDV_BASE_URL` overrides the API host. Point it only at something you trust — the API key goes
with it.

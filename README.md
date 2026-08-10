# tldv-cli

> An unofficial, community-maintained client. Not affiliated with or endorsed by tl;dv.

Command-line client for the [tl;dv API](https://doc.tldv.io). List meetings, write transcripts and
notes to files, download recordings, and bulk-export a date range to a directory.

```bash
tldv transcript latest > notes.txt
tldv export --from 30d -f md,srt --notes -d ./meetings
```

## Install

Requires Node 20.19 or newer.

```bash
npm install -g tldv-cli    # once published
npx tldv-cli ls            # without installing
```

From source:

```bash
git clone https://github.com/BogdanSerban95/tldv-cli.git && cd tldv-cli
npm install
npm run build
npm link                   # puts `tldv` on your PATH
```

During development, `npm run dev -- ls --from 7d` runs the TypeScript directly.

## Authentication

Create a key at <https://tldv.io/app/settings/personal-settings/api-keys>, then:

```bash
tldv auth login             # prompts, validates, stores at ~/.config/tldv/config.json (0600)
tldv auth status            # shows which key is in use and whether it still works
echo "$KEY" | tldv auth login --stdin
```

`TLDV_API_KEY` overrides the stored key. There is deliberately no `--api-key` flag: keys passed in
argv leak into `ps` output and shell history.

## Commands

| Command | What it does |
|---|---|
| `tldv ls` | List meetings as a table, `--json` for the raw payload, `--ids` for bare ids |
| `tldv show <meeting>` | One meeting's metadata |
| `tldv transcript <meeting>` | Transcript as txt, md, srt, vtt, csv, or json |
| `tldv notes <meeting>` | The AI notes, as Markdown |
| `tldv download <meeting>` | Stream the recording to disk, or `--url-only` |
| `tldv export` | Bulk transcripts/notes/recordings into a directory |
| `tldv import <media-url>` | Import an external recording |
| `tldv auth login\|status\|logout` | Manage the stored key |
| `tldv health` | Reachability check; the one call that needs no key |
| `tldv completion zsh\|bash\|fish` | Print a completion script |

### Naming a meeting

Every command that takes `<meeting>` accepts four things:

```bash
tldv transcript 6a797dea9dc4710013576595                       # id
tldv transcript https://tldv.io/app/meetings/6a797dea9dc47…    # URL pasted from the browser
tldv transcript latest                                         # most recent meeting
tldv transcript "Weekly sync"                                  # title search; prompts if ambiguous
```

Title search uses the API's `query` parameter, which tl;dv flags as expensive, so it only runs once
an id and a URL are ruled out. On a non-interactive stdin an ambiguous title is an error listing the
candidates rather than a prompt.

### Filters

`ls` and `export` share them:

```
-q, --query <text>     full-text search
    --from <when>      2026-07-01 | 2026-07-01T09:00:00Z | today | yesterday | 24h | 30d | 2w | 6m | 1y
    --to <when>        same formats; a bare date includes the whole day
    --type <kind>      internal (all participants share your domain) or external
    --everyone         include meetings you did not attend
```

`--everyone` is off by default, matching tl;dv's own tooling rather than the REST default.

### Transcript formats

```bash
tldv transcript latest -f srt -o ./subs/     # 2026-08-10-brain-waves-daily.srt
tldv transcript latest -f md -o -            # markdown to stdout
tldv transcript latest --no-timestamps --no-speakers
```

`txt` and `md` merge consecutive utterances from one speaker into paragraphs; `srt` and `vtt` keep
one cue per utterance, because a cue needs its own timing. `json` is the untouched API payload.

### Bulk export

```bash
tldv export --from 2026-01-01 -f md,srt --notes -d ./meetings --skip-existing
```

Writes `YYYY-MM-DD-slug.<ext>` per meeting plus `manifest.json`. `--skip-existing` consults what is
already on disk, which makes re-runs incremental. Per-meeting failures are collected and reported at
the end rather than aborting the batch; the command exits non-zero if any occurred. Meetings without
a transcript are reported as empty, not as failures.

## Output contract

Payload goes to **stdout**; progress, warnings, and errors go to **stderr**. `tldv transcript latest >
notes.txt` gives a clean file while you still see what is happening. Colors and spinners disable
themselves off a TTY and honor `NO_COLOR`.

| Exit code | Meaning |
|---|---|
| 0 | Success |
| 2 | No API key configured |
| 3 | 401, key rejected |
| 4 | 403, the key's owner cannot read that meeting |
| 5 | 404, no such meeting or no transcript yet |
| 6 | Bad arguments, or a 400 from the API |
| 7 | Network failure or timeout after retries |
| 1 | Anything else |

tl;dv documents no rate limits, so 429 and 5xx responses are retried with exponential backoff and
`Retry-After` is honored. `--retries` and `--timeout` tune that; `TLDV_DEBUG=1` prints stack traces.

## Notes on the API

- **The published OpenAPI spec is inaccurate.** It marks `template` and `extraProperties` required
  though live responses omit them, and omits fields the API does return (`status` on a meeting,
  `id` and `domain` on a user). This client parses leniently and keeps every raw payload, which is
  what `--json` and `-f json` print.
- **Pagination stops at 10,000 results.** `ls --all` and `export` warn when a filter exceeds it
  instead of silently truncating.
- **`import` returns a `jobId` that cannot be polled** — tl;dv exposes no status endpoint for it, and
  completion is only observable through the `MeetingReady` / `TranscriptReady` webhooks. The command
  says so rather than showing a progress bar it cannot back.
- **Download URLs expire after six hours.**
- **`/highlights` is deprecated** in favor of `/notes` and is not wrapped.

## Development

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run lint      # biome
npm run build     # tsup → dist/tldv.js
```

## License

MIT

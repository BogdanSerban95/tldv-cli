# tldv-cli

Command-line client for the tl;dv API (`v1alpha1`, base `https://pasta.tldv.io`, header
`x-api-key`). TypeScript, ESM, Node ≥20.19.

**Read `CONTRIBUTING.md` first.** It holds the design rules, commit conventions, and release
process, and it is canonical. This file adds the map and the traps.

## Commands

```bash
npm run dev -- ls --from 7d   # tsx, no build step
npm test                      # vitest
npm run typecheck             # tsc --noEmit, strict
npm run lint                  # biome
npm run build                 # tsup → dist/tldv.js
```

## Layout

```
src/bin.ts        entry: catches every error, maps it to an exit code, handles EPIPE
src/cli.ts        commander program assembly, global options, --version
src/commands/     one file per command; each owns its own flags and output
src/context.ts    builds { api, out, config } from global options; throws if no key
src/api/
  client.ts       fetch wrapper: auth header, timeout, retry/backoff, status → typed error
  endpoints.ts    TldvApi — one method per endpoint, plus iterateMeetings and downloadFromUrl
  normalize.ts    raw JSON → domain models, deliberately lenient
  types.ts        domain models and request shapes
src/core/         config, errors, dates, filenames, pool, resolve-meeting
src/formats/      transcript.ts (txt|md|srt|vtt|csv|json), notes.ts, time.ts
src/ui/           output (stdout/stderr split), table, spinner, theme
```

Data flows one way: `commands` → `api` → `normalize`, with `formats` and `ui` as leaves. Nothing in
`api/` or `formats/` may write to a stream; only `ui/output.ts` does.

## Where things live

| Task | File |
|---|---|
| Add a command | `src/commands/<name>.ts`, then register in `src/cli.ts` |
| Add a transcript format | `TRANSCRIPT_FORMATS` and the switch in `src/formats/transcript.ts` |
| Change error text or exit code | `src/core/errors.ts` and `toApiError` in `src/api/client.ts` |
| Change how a meeting argument resolves | `src/core/resolve-meeting.ts` |
| Change filters shared by `ls` and `export` | `src/commands/shared.ts` |

## API facts worth not rediscovering

- **The published spec is wrong in both directions.** It marks `template` and `extraProperties`
  required though live responses omit them, and omits `status` on a meeting plus `id`/`domain` on a
  user. Hence lenient parsing and `raw` on every model.
- **Pagination stops at 10,000 results.** `iterateMeetings` fires `onCapped`; callers must warn.
- **`import` returns a `jobId` with no endpoint to poll.** Completion only surfaces over the
  `MeetingReady` / `TranscriptReady` webhooks. Do not add a progress bar for it.
- **Download is a 302 to a signed URL that expires in six hours**, served without `content-length`,
  so download progress has no percentage. Fetch that URL without the API key.
- **`query` is expensive** by tl;dv's own description. `resolve-meeting.ts` only uses it after an
  id, a URL, and `latest` are ruled out.
- **`onlyParticipated` defaults to `false` in the REST API but `true` in tl;dv's own tooling.** This
  CLI follows the tooling; `--everyone` opts out.
- **No rate limits are documented**, which means unknown, not absent. 429 and 5xx retry with
  backoff and honour `Retry-After`.
- **There is no user-profile endpoint.** Probed `/users/me`, `/me`, `/user`, `/profile`,
  `/users/profile`, `/user/profile`, `/account` — all 404. Do not add `whoami`.

## Traps

- `createSpinner` returns a no-op off a TTY. Never report a result only through the spinner; use
  `ctx.out.success` so scripted runs see it too.
- `resolveMeeting` costs an extra request over `resolveMeetingId`. Only call it when the output
  needs metadata (markdown header, generated filename).
- Notes markdown arrives with root-relative links (`](/app/meetings/…)`) that are dead in a saved
  file. Write notes through `prepareNotes`, never raw.
- `--no-speakers` and `--no-timestamps` arrive as `speakers: false` / `timestamps: false` from
  commander, not as `noSpeakers`.
- Global options live on the root command; a leaf reads them with `optsWithGlobals()`, wrapped as
  `globalsOf(command)`.

## Verifying a change

Unit tests stub `fetch`. For anything touching request or response handling, also run the built CLI
against the real API — `tldv ls --from 7d`, `tldv transcript latest -f srt`, `tldv export --from 3d
--dry-run` — because the mock can agree with the documentation and still be wrong.

# Contributing

## Setup

```bash
npm install
npm run dev -- ls --from 7d    # runs the TypeScript directly via tsx
```

You need a tl;dv API key for anything beyond `health`. Create one at
<https://tldv.io/app/settings/personal-settings/api-keys> and either run `tldv auth login` or export
`TLDV_API_KEY`.

## Checks

All four must pass before a pull request merges; CI runs them on Node 20, 22, and 24.

```bash
npm run lint       # biome check
npm run typecheck  # tsc --noEmit, strict
npm test           # vitest
npm run build      # tsup
```

`npm run format` applies Biome's fixes. Do not hand-format around it.

## Design rules

These are load-bearing. A change that breaks one needs a reason in the pull request.

1. **stdout carries payload, stderr carries everything else.** Progress, warnings, confirmations,
   and errors go to stderr so `tldv transcript latest > notes.txt` produces a clean file. Use
   `Output` (`src/ui/output.ts`) rather than `console.log`.
2. **No runtime schema validation.** The published OpenAPI spec is wrong in both directions, so
   parsers in `src/api/normalize.ts` tolerate missing fields and keep the untouched payload in
   `raw`. A validator would reject responses the API actually sends.
3. **Exit codes are a contract.** The table in `README.md` maps to `ExitCode` in
   `src/core/errors.ts`. Scripts depend on these; do not renumber them.
4. **Errors carry a hint.** Every `TldvError` should say what to do next, not only what failed.
5. **Never accept a secret in argv.** Keys land in `ps` output and shell history. The API key comes
   from the config file or `TLDV_API_KEY`, and only ever prints through `redactKey`.
6. **Validate arguments before building the context.** A typo in `--format` should not report a
   missing API key.
7. **Runtime dependencies need justification.** There are three. The spinner, table, and
   concurrency pool are deliberately hand-rolled; each is under 60 lines.
8. **Subtitle formats keep one cue per utterance**; `txt` and `md` merge consecutive utterances from
   one speaker. Do not unify these.
9. **No silent truncation.** When a limit or an API ceiling cuts results, warn on stderr. Silent
   truncation looks identical to a complete result.

## Testing

Vitest, no test framework beyond it. Unit tests stub `globalThis.fetch` with `vi.stubGlobal`; see
`tests/client.test.ts`. Anything touching the network in a test is a bug.

For end-to-end checks against realistic payloads, run a local mock on `127.0.0.1` and point the CLI
at it:

```bash
TLDV_BASE_URL=http://127.0.0.1:8787 TLDV_API_KEY=test-key node dist/tldv.js ls
```

Before merging anything that touches request or response handling, run it once against the real API
too. The spec's inaccuracies mean the mock can agree with the documentation and still be wrong.

## Commits and pull requests

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`,
`refactor:`, `test:`. The subject says what changed; the body says why, and names the behavior a
user would notice.

Pull requests should describe the user-visible change and how it was verified. Keep unrelated
refactors out.

## Releasing

The package publishes from a tag, with npm provenance.

```bash
npm version patch      # or minor / major — writes the commit and the vX.Y.Z tag
git push --follow-tags
```

Pushing the tag triggers `.github/workflows/release.yml`, which reinstalls, runs the checks, and
publishes. There is no publish token: the workflow authenticates over OIDC against the trusted
publisher configured for the package on npmjs.com, which is pinned to this repository and to
`release.yml` by name. Renaming that workflow file breaks releasing until the publisher is
updated to match.

To dry-run what would ship: `npm pack --dry-run`. The tarball should contain `dist/`, `README.md`,
`LICENSE`, and `package.json` — nothing else.

## Reporting API surprises

tl;dv's API is `v1alpha1` and its published spec is known-inaccurate. When you find a new
discrepancy, add it to the "Notes on the API" section of `README.md` along with the fix, so the next
person does not rediscover it.

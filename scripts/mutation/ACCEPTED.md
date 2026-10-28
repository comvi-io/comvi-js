# Accepted mutants — rationale

Entries in `accepted.json` are matched by file + mutator + the text of the mutated line
(`accept.mjs`). An entry accepts ONE mutant per mutator it lists on its line; a second
mutant of the same mutator there is a survivor until it is pinned. `pins: [{ mutator,
column, replacement }]` accepts exactly the mutants named (column counted from the line's
first non-blank character, 1-based; `replacement` as Stryker reports it); `mutators: ["all"]`
accepts every mutant of the line. Longer arguments live here.

## Matching by span (lot 3, 2026-10-28)

An entry used to accept every mutant of its listed mutators on its line, so two mutants of one
mutator (the two separators of a cache key) shared one exemption (lot 1d review B, MEDIUM 15).
Now one per mutator, or exact pins; `accept.test.mjs` (in `pnpm test:release-tools`) pins both,
each seen failing on the old matcher. Twenty entries of code lot 3 removed are gone with it
(`packages/cli`: the 0.7 command registrations, `generate-types.ts`, the SSE subscription of
`ApiClient.ts`; `packages/vite-plugin`: `extract.ts`, `scheduler.ts` and the 0.7 plugin body;
`packages/typegen`: the 0.7 `index.ts`). No package was re-run under Stryker in this pass, so
an entry that relied on covering two mutants of one mutator shows its second mutant as a
survivor on the next run, with the hint to pin it.

## packages/core and packages/react, 0.8 (lot 1d, 2026-10-28)

The 0.7 core and React files are gone (lots 1a–1c); their 209 entries were removed with them, and the two entries of the 0.7 `src/format.ts` that matched no live mutant.
The 0.8 sources were run COLD (no `.stryker/incremental.json`) under Node 24: core 1588
mutants (144 static, ignored by `ignoreStatic`), React 122 (9 static). Every entry below was
hand-applied with `pnpm exec vitest run` of the package (with `COMVI_MUTATION=1`, as Stryker
runs it) observed green; the reason is in the entry.

- Families: performance guards whose generic branch renders the same (`compile()`'s static
  fast path, `{x}`'s string fast path, the `<` pre-check of the sticky TAG regex, the `=` pre-check
  of EXACT, `if (buf)` in flush), memo keys and allocations that only cost (`ej.j == j`, the
  `s.dp` copy, a second store copy in view()), production `fail()` calls whose next check fails
  the scan with the same message-less report (icu.ts 84/103), redundant operands (`n >= 0` next
  to `1 / n > 0`), defaults that the code's own else-arm already covers (`order`'s "navigator",
  persist's `to = "cookie"`), and unreachable text (`parts[0] || ""`, a catch block returning
  `undefined` either way).
- Kept on purpose: `cache.ts` 51 (`e !== SYNTAX`). The only non-SYNTAX throw that can leave the
  scanner is a stack overflow on a pathologically deep template; the mutant would render it as a
  syntax fallback. Pinning the crash in a test would pin a defect, so the entry stays.
- Tooling found on the way: vitest's `expect(p).rejects.toThrow("text")` PASSES when `p` rejects
  with `undefined` (checked 28.10.2026), which hid `instance.ts` 449 (`throw bad.get(wrong key)`
  = `throw undefined`). Pin a rejection with `rejects.toBe(error)` or by catching the value.
- `packages/react` runs `--inPlace` (run.mjs adds the flag): its vitest
  config aliases `@comvi/core` to `../core/src`, which a sandbox copy of the package lacks. Both
  packages leave `tests/contracts` (and core `tests/dist`) out under `COMVI_MUTATION`: those read
  the built dist or the source TEXT, which Stryker instruments.
- The resetModules lesson (2026-09-02) still holds: a `vi.resetModules()` + dynamic `import()`
  in a test body re-runs module initialization inside the coverage window and resurrects every
  static mutant of the graph. No 1d test imports dynamically.

## packages/solid (kill-pass 2026-09-01)

- T.tsx:100 `content.length === 0` -> false: strings are handled one branch earlier, null/undefined
  still caught by `!content`, and an empty array renders nothing whether it returns `<></>` or falls
  through to `[].map(...)`. Evidence: mutant 100:19-100:39 hand-applied, full suite 146/146 green.
- T.tsx:190 `typeof content === "string"` -> true: redundant with `content === keyString`, which can
  only hold for a string primitive. Evidence: mutant 190:11-190:38 hand-applied, 146/146 green.

## packages/vue (kill-pass 2026-09-01)

Every entry hand-applied with the full suite observed green; DOM dumps where rendering was the
question. Families: revision counters whose VALUE is never read (only the change matters:
VueI18n 167/172), no-op guards around empty/undefined component maps (T 129/131/136 — an empty
merged map and undefined behave identically in prepareTranslation), fragment-wrapping shortcuts
whose output is byte-identical up to Vue's internal empty-text anchors (T 175/200), the
initial-locale no-op assignment (VueI18n 128), and the single-element unsubscriber list
(VueI18n 421). (T 191 and VueI18n 449 were proposed too, but those mutants are absent from the
current Stryker mutant set — entries dropped as stale rather than kept speculatively.)

- T.ts:174 `[rendered]` -> `[]` (nocov): unreachable — Vue's normalizeSlotValue hands T an array
  from every slot function, so the single-node wrap never executes. Hand-applied, suite green.
- Registry notes (2026-09-01): Stryker's ConditionalExpression mutator skips ternary conditions
  that are bare identifiers or non-comparison BinaryExpressions (e.g. `instanceof`) — hand-probing
  such conditions explores mutants the real set never contains. Fragile-hint pair: the two
  `this._configRevision.value++;` entries (VueI18n 167/172) share a snippet and are disambiguated
  only by lineHint — an edit above line 172 would silently re-bind them.

## packages/next (kill-pass 2026-09-02)

Every entry hand-applied with the full suite observed green (184-probe consolidated re-run).
Families: pure-memo and no-op guards (routing utils WeakMap, composedHost translation/devtools
options, getI18n's warm-cache hasLocale guard, cache.ts's undefined member), discarded return
values (syncLocaleSafely), redundant sanitation (Accept-Language trim/empty-code — line 218 and
the three lookups rescue every case), the once-cell identity check that can never be false, and
the module-scope useIsomorphicLayoutEffect ternary (act() equalizes the two hooks; do NOT chase
with resetModules). Watch item: createMiddleware.ts:185 `return undefined;` at a function tail —
if a survivor appears there it is fall-off-the-end equivalent, evidence already gathered.

## packages/nuxt (kill-pass 2026-09-02)

69 entries, every one hand-applied in the worktree with the full 256-test suite run: 51
equivalent (redundant guards re-checked downstream — i18n.global's pathname guard, module.ts's
rootPages filter vs the later cleanup, request-i18n's unobservable WeakMap delete; head/path
composables' defensive branches), 13 tooling:static-mutant (module-scope EMPTY_CONFIG,
locale-state KEY, NuxtLinkLocale defineComponent props — hand-probes turn tests RED but the
mutant switch arms after module init), 5 needs-seam (import.meta.server / import.meta.dev —
no test seam exists; a config-level rewrite plugin would unlock these plus plugin.ts's SSR
payload path, decision recorded in the handoff).

- next round 2: the detectFromSource default-case fall-off, two Accept-Language fallback literals
  made redundant by downstream backstops, and the UrlObject pathname literal that both branches
  normalise away. TWO GENERAL LESSONS from this round: (1) a factory called at describe scope
  captures config BEFORE the mutant switch arms — construction-time claims need the factory call
  INSIDE the test body; (2) expect(fn).toThrow(msg) passes when the thrown value is `undefined` —
  assert instanceof Error via a capture helper wherever src RETURNS the error its caller throws.
- next static closeout: 12 module-init mutants (displayName assignments, module-scope const
  arrows and string/object constants) + cache.ts:58/101, whose module-level MUTABLE `let cell`
  the runner never re-evaluates between activations. Every one hand-applied and observed
  turning the suite RED — claims exist; only the tool cannot see them.

## Round 13 — cli kill-pass (2026-09-03): the last package to 100.0

packages/cli 78.2 % -> **100.0 % adjusted** (1 819 killed, 0 survived, 0 nocov,
106 accepted). Four worktree lots (api / cmd / typegen / syncfg) + a lead
closing lot for version.ts; suite 319 -> 468 (mutation view 462). 61 new cli
entries, every one hand-applied against the full COMVI_MUTATION=1 suite.

Rationale classes (details in each entry):

- instanceof-Error / instanceof-TypegenError catch preludes: wrapError already
  passes TypegenError through and no non-Error can reach the command catches —
  the rethrow guards are unobservable (the `-> true` variants are killed).
- unreachable apiKey guards in push/pull: ConfigLoader.load() throws
  CONFIG_INVALID first (matches the src comments).
- empty-string encodings ("utf-8" -> ""): Node treats "" as unset and falls
  back to utf8 for string data; readFile Buffers coerce identically through
  JSON.parse — each proven by a direct node probe.
- JSON.stringify-omits-undefined spreads (ConfigLoader 247/248).
- $-after-.\* multiline regex anchors (TypeGenerator): `.` never matches \n.
- co-varying SSE stale-guards + three needs-seam UpdateOperator generation
  mutants (ApiClient): the distinguishing interleaving hides inside the
  awaited import("eventsource") window; a pending ASYNC vi.doMock factory
  falls through to the REAL module on a concurrent import (canon gotcha).
- captureStackTrace (errors.ts): vite-node stacks never carry the constructor
  frame — only the built binary observes trimming (needs-seam).
- version.ts:9 first candidate literal: dist-layout-only observable
  (gap:prod-build); tests/dist/cli-entry.dist.test.ts pins --version.

Timeout-kill: EnvLoader.ts:72 `parent === dir` -> false turns findEnvFile into
a synchronous infinite loop — a walk-to-root test reaches it and Stryker
scores the hang TimedOut/detected; deliberately NOT an accepted entry.

Round finds beyond mutants: tests/dist/cli-entry.dist.test.ts was untracked
(root `dist` gitignore pattern; cli missing from the canary exception list —
CI had never run it) and react's tests-typecheck raced @comvi/react#build in
the Quality job (fixed by source-pinning @comvi/react like @comvi/core).

## packages/typegen message-shape.ts (COM-179 A0, 2026-10-21)

Deleted in lot 3b (0.8): typegen and `comvi check` read messages with `@comvi/core`'s own scanner
(`packages/typegen/src/v2/read.ts`), so this second ICU reader and its 23 accepted entries are
gone, with those of the deleted `@comvi/cli` `TypeGenerator.ts` (1) and `FileSystemWriter.ts` (2).
The record below is history.

The ICU scanner moved here from `packages/vite-plugin/src/extract.ts` and was mutation-tested for
the first time since its rewrite: 124 survivors on develop. `tests/message-shape.test.ts` kills
every non-equivalent one; each row in its "group boundaries" block was checked against
`@comvi/core` with `icuCompiler`, and the tag rows are checked by
`tests/message-shape-tag-parity.test.ts` against core with `@comvi/core/tags`. Every accepted
entry was hand-applied against the full typegen suite (green) and fuzzed (300 000 generated
messages, original vs mutant, no difference). Families:

- bounds checks one past the end (`i < len` -> `i <= len`, `-> true` on a whitespace skip): the
  extra read is `undefined` / NaN, which matches no branch, and every caller treats an index at or
  past the end as the end;
- `opensHashScope`'s no-comma exit and the context stack's empty case, which cannot occur for a
  group that can close at all; a one-comma argument failing the choice-list parse as surely as
  the early refusal;
- the tag pass re-reading a tag's last name character and its `>` (`i++ -> i--`, `i + 1 -> i - 1`
  around a tag's end): neither character starts anything, so only work is repeated.

Review correction (PR #109): the `if (i >= len) break` and `.trim()` entries in `parseChoices` were
first accepted as a redundancy pair. They are not one: `charCodeAt <= 32` skips a NUL that `trim`
keeps, and `trim` removes a no-break space that `<= 32` does not. Both entries are gone; the NUL
and no-break-space rows kill the three mutants (core agrees with the original on both inputs).

Two vite-plugin `src/extract.ts` entries left with the move: the message-scan loop entry now lives
under typegen, and the `for (let i = open; …)` entry was already stale on develop (that loop no
longer exists). The two `fs.readFile(…, "utf-8")` entries stay; `extractSchema` did not move.

The same cold run of packages/vite-plugin added one entry (`writeAtomically`'s
`fs.rm(…, { force: true }).catch(…)`, equivalent: the catch swallows what `force` would). Two real
survivors predate the move and stay open, because A0 keeps `packages/vite-plugin/tests/**`
byte-identical: `extract.ts` `if (unsupported !== undefined)` -> `true` (no test asserts that a
supported key raises no issue) and `index.ts`'s warning tail `parameters were generated for it: …`
(no test asserts the whole message). Both are killable by a test, so neither is accepted.

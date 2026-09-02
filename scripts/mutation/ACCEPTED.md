# Accepted mutants — rationale

Entries in `accepted.json` are matched by file + mutator + the text of the mutated line. Longer arguments live here.

### src/core/translate.ts (near `if (!(tokens.length === 0 || (tokens.length === 1 && tokens[`)

The classification below is an optimization HINT, not behaviour: `flags`
only chooses between `processSimpleParams` and `processTokens`, which
render an identical text/param token list, and it can only lower
`isStatic` for templates that are already non-static. The one
combination that would change output — TF_SIMPLE_PARAMS on a template
that also holds plural/select/tag tokens — is unreachable from any
single mutation, so the mutants below are equivalent. A `_templateFlags()`
seam next to `isStaticTemplate()` would make them observable.

### src/core/translate.ts (near `if (`)

The single-param metadata below only ARMS the fast path in
translateTemplateWithCache. A mutant that stops it from being written is
invisible — processSimpleParams then renders the same output — so those are
disabled; the ones that would arm it with the WRONG token are killable and
deliberately left live.

### src/core/translate.ts (near `let hasSpecialChar = false;`)

Forcing the slow route below re-parses the template and renders the same
output. The placeholder entry it caches is ALSO read back by
translateSegment (which does not consult isStatic), so a mutant that
misclassifies a template here is killable through the per-call fallback
path and is deliberately left live.
caches REAL tokens, which only the (buggy) fallback read could tell apart

### src/core/translate.ts (near `if (cached.singleParamName !== undefined) {`)

The single-param fast path is an OPTIMIZATION: every mutant that stops it from
firing falls through to processSimpleParams below, which renders the same string
for the same inputs. Only a mutant that makes it produce a WRONG value is
killable, which is why the metadata assignments above are not disabled.

## Continuation notes salvaged from the stripped directives (2026-08-29)

## Continuation notes salvaged from the stripped directives (2026-08-29)

- translate.ts, template classification: TF_SIMPLE_PARAMS — a three-token parse can only be
  [text, param, text], so the third operand can never be the one that decides the branch; another
  flag set can never be [text, param, text].
- translate.ts, single-param fast path: the (template, param) dedup key cannot collide — a param
  name is always braced inside its own template, so no two distinct pairs concatenate equally.
- translate.ts, compiled-template branch: re-enters translateSegment, which finds the same cache
  entry; the placeholder entry is read back by translateSegment (that is why the `<`/`&` scan
  mutants are killable and are NOT accepted).
- translate.ts, parts assembly: the value that would fail the test is appended by appendParamValue,
  which String()s it to the same characters; an all-primitive part list joins to the same string;
  only objects are ever pushed, so an all-primitive list can never hold two parts.
- compile-simple.ts / logger.ts / loader.ts / plugins.ts / i18n.ts / defaultParams.ts /
  capability.ts: the `: "E_…"` arms and `!IS_DEV` branches are unreachable while the only vitest
  config pins `__DEV__: true` — recorded as `gap:prod-build`, closable with a second vitest project
  built with `__DEV__: false` (which would also exercise the prod ICU fail-soft path directly).

## packages/solid (kill-pass 2026-09-01)

- T.tsx:100 `content.length === 0` -> false: strings are handled one branch earlier, null/undefined
  still caught by `!content`, and an empty array renders nothing whether it returns `<></>` or falls
  through to `[].map(...)`. Evidence: mutant 100:19-100:39 hand-applied, full suite 146/146 green.
- T.tsx:190 `typeof content === "string"` -> true: redundant with `content === keyString`, which can
  only hold for a string primitive. Evidence: mutant 190:11-190:38 hand-applied, 146/146 green.

## packages/react (kill-pass 2026-09-01)

Three families, every member hand-applied with the full suite observed green:

- **String fast paths** (useI18n.ts:63/83/89, T.tsx:175/184/260, and the allocation guard T.tsx:165):
  each guard's body is behaviourally identical to the generic branch below it — String(s)===s,
  Fragment wrap reuses the same key, empty-Map vs null lookup both yield undefined. Performance
  guards, not behaviour; killable only by deleting the redundant fast paths in src.
- **mountedRef latches** (useSetLocaleTransition.ts:30/31/32/40, I18nProvider.tsx:71/75): React 19
  performs setState-after-unmount as a silent no-op, so the latches have no observable effect.
  useSubscribe's identical latch IS killed because its subscribe fn is exported and drivable.
- **Singles**: useI18n.ts:38 (`"props" in value` implied by the typeof that follows), :270 (right
  operand of `locale || i18n.locale` unreachable — a test pinning the divergence failed on
  unmutated src), I18nProvider.tsx:87 (namespace join separator — the list only grows, so no
  colliding pair exists; the fallback-locale join, whose list is replaced, IS killed),
  useSetLocaleTransition.ts:34 (constant-content deps array).

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
- react follow-up (round 2): T.tsx:175 extended to the emptied-block mutant; T.tsx:180 null-child
  vs empty-list (React renders both as zero-child DOM, probed); the two `?? ""` locale fallbacks
  (I18nProvider:212, useI18n:204) unreachable behind the throwing instance guard. The dropped
  useI18n.ts:38 `"props" in value` entry: the mutant is genuinely redundant (implied by the
  typeof that follows) but absent from the current mutant set — if it reappears surviving, that
  is the ready-made reason, not a regression.
- Registry notes (2026-09-01): Stryker's ConditionalExpression mutator skips ternary conditions
  that are bare identifiers or non-comparison BinaryExpressions (e.g. `instanceof`) — hand-probing
  such conditions explores mutants the real set never contains. Fragile-hint pair: the two
  `this._configRevision.value++;` entries (VueI18n 167/172) share a snippet and are disambiguated
  only by lineHint — an edit above line 172 would silently re-bind them.

## packages/core prod-profile closing (2026-09-02)

The resetModules lesson, learned the hard way: a vi.resetModules() + dynamic import inside a test
re-runs MODULE INITIALIZATION inside the coverage window, un-ignoring every static mutant of the
transitive graph and attributing them all to that one file — 61 phantom survivors. The file was
deleted; its claims live in ordinary tests (exact dev messages in initialization/host-option/
host-error tests, prod arms in tests/prod). Do NOT close static-mutant nocov entries with
re-import tests. Remaining accepts: 4 module-scope/constructor StringLiterals whose both arms are
suite-killed but tool-invisible (i18n 55/58/61/263), plus i18n.ts:808's prod arm (argument to a
warn() that prod compiles out — same class as compile-icu 200 / tags 238).

## packages/next (kill-pass 2026-09-02)

Every entry hand-applied with the full suite observed green (184-probe consolidated re-run).
Families: pure-memo and no-op guards (routing utils WeakMap, composedHost translation/devtools
options, getI18n's warm-cache hasLocale guard, cache.ts's undefined member), discarded return
values (syncLocaleSafely), redundant sanitation (Accept-Language trim/empty-code — line 218 and
the three lookups rescue every case), the once-cell identity check that can never be false, and
the module-scope useIsomorphicLayoutEffect ternary (act() equalizes the two hooks; do NOT chase
with resetModules). Watch item: createMiddleware.ts:185 `return undefined;` at a function tail —
if a survivor appears there it is fall-off-the-end equivalent, evidence already gathered.

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

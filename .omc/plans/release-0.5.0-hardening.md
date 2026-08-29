# 0.5.0 hardening → production release

Status: **rev 3 — 2026-08-29. D1/D2 decided by the owner; rev 1 critiqued (4/10) → rev 2 (8/10) →
rev 3 closes the RC-machinery blockers and the D1 implementation ambiguities.
Phase 0 EXECUTED 2026-08-29 (commits `069aeb6..9e31672`, evidence in
`.omc/handoffs/hardening-p0.md`): all automated gates green; the human Web Store upload of
`comvi-extension.zip` 0.5.0 is the one open Phase-0 item. D2 was done by reconstruction from
`.omc/tmp/changeset-status.json` (51 changesets, 10 of which the version run had never consumed),
not from HEAD — see the handoff §2. Next: Phase 1.**
Scope: take `feat/weight-refactor-0.5` (HEAD `0672133` + ~408 uncommitted single-entry P2–P6 changes)
to a shippable 0.5.0. The direction (one entry per package, base host + `.with()` capabilities) is
CONFIRMED and is not reopened here.

Evidence base: analysis session 2026-08-29 — size runs via `scripts/size-check.mjs` (43/43 green),
`pnpm typecheck` 33/33 green, `node scripts/check-release-plan.mjs` exit 1 (G7 allowlist points at
consumed changesets), runtime probes on `packages/core/dist`, plans-reader / code-reviewer /
plan-critic reports. Numbers are min+gz bytes.

Rules for this plan:
- No byte-level ceilings are added. Every code fix carries a test and a changeset.
- Authoring and review are separate passes (executor → reviewer/verifier); a gate counts only when
  it has been observed failing at least once (see memory `gates-must-be-observed-failing`).
- `G7: OK` is a gate at the END of every phase that edits prose; the allowlist is re-pinned then
  (it keys on file+line+pattern and unused entries FAIL, `scripts/check-release-plan.mjs:695-699`).

---

## 0. Decisions (owner, 2026-08-29)

### D1 — ICU policy: explicit choice only; prod fail-soft. (ADR amendment, see §0.3)
Problem: the base host's simple compiler throws `E_ICU_SYNTAX` in dev AND prod
(`packages/core/src/core/translate/compile-simple.ts:26-50`); `fetchLoader()` composes loader +
plugins only (`packages/plugin-fetch-loader/src/installer.ts:59-64`); the platform has first-class
plural keys (`TranslationKey.isPlural`, `apps/web/src/composables/usePluralRules.ts`). A PM toggling
"plural" on a key crashes production for every app that did not compose ICU.

Owner constraints: ICU is NEVER added automatically — not to the base host, not by `fetchLoader()`.
The user composes `.with(icu())` / `compiler: icuCompiler` themselves.

Decision:
1. **Dev stays fail-loud.** Eager catalog walk at both ingestion seams throws with the fix in the
   message (unchanged).
2. **Prod becomes fail-soft, at ≈0 B for the literal.** In prod `simpleCompiler.makeArgToken` returns
   `undefined` for an ICU argument instead of throwing; `parseTemplate` then emits ONE raw
   `TK_TEXT` token for the balanced brace group (`parser.ts:105-137, 205-208`), so
   `{n, plural, one {<b>#</b>} other {…}}` is rendered verbatim and is never re-parsed by a tag
   extension. Same policy the wave already applies to string-API tags (dev-warn / prod-literal).
3. **Best-effort prod signal, not "once per template".** The compiler cannot see key/locale/ns
   (`translate.ts:241-247`) and the template cache is module-global (1000 entries, cleared on tag
   registration, `translate.ts:47-75`), so "exactly once per template" is not implementable.
   Mechanism: the prod branch sets a module-level `lastIcuArgType` on the cache-miss compile;
   `I18n._translate` (`i18n.ts:758`, which has `key`/`namespace`/`locale`) reads-and-clears it
   **immediately after EACH `translate()` call** — the primary at `i18n.ts:782` AND every iteration
   of the fallback-locale loop at `:799` — so the report carries the locale that actually compiled.
   It calls `this.reportError(err, { source: "compile", key, namespace, locale })`, where `err`
   owns only `code: "E_ICU_SYNTAX"` + `argumentType` (the "telemetry lives in context, not in error
   fields" contract of `compile-simple.ts:33-37` is preserved). **`console.error` placement:** at
   the `_translate` call site, guarded by `!this._onError`, for this path ONLY — `reportError`
   itself (`i18n.ts:898-912`, five call sites) is NOT changed, so no other prod path gains output.
   Documented as: "reported on each compilation of the template (per process, best-effort), never
   on cached renders".
   **Budget:** ≤ 80 B on `core-base`; measured, not estimated. **Abort:** if > 80 B or the translate
   hot path regresses > 5 % (perf protocol §6.5) → ship the literal only (no call-site signal), keep
   `console.error` inside the compiler's cache-miss branch, record in the ADR.
4. **Dev-time signal stays the existing eager throw.** The rev-1 idea "typegen warns + emits
   `requiresIcu`" is dropped for 0.5.0: typegen DOES fetch the project schema from the platform
   (`packages/cli/src/core/ApiClient.ts:258-262`, `GET /v1/projects/:id/schema`), but that schema
   carries only `SchemaParam.type: "string" | "number"` (`packages/cli/src/types.ts`) — no plural
   flag, `select` keys surface as `"string"`, and `number` also covers date/time params — and the
   emitter writes an ambient `.d.ts` that cannot carry a runtime export
   (`packages/cli/src/core/TypeEmitter.ts:35-67`). Backlog §9: the schema endpoint must expose an
   ICU/plural flag first, then the CLI can warn.
5. **Every host must be able to make the choice.** Nuxt's generated default host has no `compiler`
   option and no `.with()` seam (`packages/nuxt/src/module.ts:255-271`, README:95-99) → Phase 3 adds
   an explicit `comvi.icu: true` module option that emits `compiler: icuCompiler` in the generated
   host (off by default; `hostModule` remains the full escape). `@comvi/next`'s `createNextI18n`
   hardwires ICU (`packages/next/src/composedHost.ts:49`) as the documented 0.4-compat host — named
   in the docs as an exception alongside the CDN global, not changed.
6. **Docs:** the platform snippet is `.with(icu()).with(fetchLoader({ cdnUrl }))` with one line
   "drop `icu()` if you use no plural/select". The base stays 5 KB.
Rejected: auto-ICU in `fetchLoader`; ICU in the base host; keeping the prod throw.

### D2 — Undo the local `release:version` run.
Restore `.changeset/*.md` from HEAD, revert generated CHANGELOG edits and `version` fields to 0.4.x
(keep every other package.json change). Consequences the plan must carry: the restored
`.changeset/core-single-entry-convergence.md:12,46` says "dev AND prod throw" and is in the G7
corpus (`check-release-plan.mjs:407-416`) → rewritten in Phase 1, re-pinned in Phase 5; the
`.changeset/core-global-discovery-v2.md:7` placeholder ("see release notes for the minimum extension
version") is resolved by hand in Phase 6 (fs-p6 §8.1.3).

### 0.3 ADR bookkeeping (Phase 1 deliverable, docs only)
- `comvi-single-entry.md` gets a "rev 5 amendment (2026-08-29)" section: §1 "production throw"
  → "production literal + best-effort report"; Decision Driver 3 and R8/PM1 re-stated (the
  converged default is still safer than the rejected prod-silent slim: dev throws, prod reports).
- `open-questions.md:120` (STANDING `E_ICU_SYNTAX` revisit) closed with the owner decision — the
  revisit fires now, on product evidence (`isPlural` in the platform), not after the window.
- `open-questions.md:113` (CI perf canary) → promoted to a gate (§6.5), not a follow-up.

---

## 1. Phase 0 — Freeze the state and start the long pole (Mon 31.08, ½ day) — P0
1. Commit the working tree as reviewable commits by area (core / wrappers / plugins / scripts / docs),
   messages `single-entry(p2..p6): …`. No behaviour change.
2. Apply D2. Gate: `node scripts/check-release-plan.mjs` prints `@comvi/core 0.4.0 -> 0.5.0 (minor)`
   and `G7: OK` (the 7 "stale" allowlist entries match again once their files are restored; if any
   line drifted, re-pin now).
3. **Chrome extension: bump `apps/chrome-extension` package.json + manifest.json to 0.5.0, run
   `pnpm extension:test` + `pnpm extension:gate-e`, and SUBMIT to the Web Store the same day.** It is
   dual-protocol and 0.4-compatible by construction (`contracts/chrome-extension-proxy.json:23-32`,
   `apps/chrome-extension/src/content/detector.ts:31-57`), so it can ship before core; review latency
   is the release's serialized blocker and starts ticking here, not in Phase 6.
4. Baseline recorded in `.omc/handoffs/hardening-p0.md`: `pnpm typecheck`, `pnpm test:commit`,
   `pnpm size`, `pnpm bundler-matrix`, `pnpm build:all` (test-apps build), perf baseline per §6.5.

## 2. Phase 1 — ICU policy (D1) (01–02.09, 1½ days) — P0
- Core: `compile-simple.ts` prod branch returns `undefined` + sets `lastIcuArgType`; `_translate`
  call-site report (D1.3); dev path unchanged; `E_COMPILER_LOCKED` unchanged.
- Tests: prod build renders the literal (incl. nested braces and `<b>` inside), reports on compile
  with `code`/`argumentType` in the error and `key`/`namespace`/`locale` in the context; cached
  renders do not re-report; no `onError` → `console.error`; dev still throws at ingestion;
  `composite-parity` unchanged; SSR two-instance test documents the per-process behaviour.
- Size: `core-base` re-measured; delta recorded (≤ 80 B) — no new row. Perf: §6.5 protocol on
  `translate` hot path, before/after.
- Prose (all locations, grep-verified `dev AND prod throw|prod throw|non-cached`): restored
  `.changeset/core-single-entry-convergence.md:12,46`, `MIGRATION.md:23` + §0 table + §0.2,
  `packages/core/README.md` quickstart bullet, root `README.md` "Without compiler: icuCompiler…"
  paragraph, `packages/next/README.md:296`, the wrapper READMEs' ICU bullets. ADR bookkeeping §0.3.
- Gate: tests + size + perf + `G7: OK` after re-pin of the two changeset lines.

## 3. Phase 2 — Verified defects (02–04.09, 2 days) — P0/P1
| id | defect | fix | test |
|---|---|---|---|
| B2 (P0) | `.with(loader()/plugins())` or `.use()` AFTER `init()` silently no-ops (`core/i18n.ts:390`) | dev warn naming the rule; documented; NO late `_beforeInit` replay (lifecycle risk) | late-compose test (dev warns, prod documented) |
| B4 (P0) | `I18nPluginHost` promises `I18nLoaderApi` on a plugins-only host (`types.ts:1006-1009`, cast `core/plugins.ts:155`) → bare `TypeError` | `_beforeInit` installs throwing shims via `missingCapability("loader")` for the loader members | plugin on plugins-only host gets the actionable error, dev and prod |
| B3 (P1) | `attachDevtools` idempotency keyed on the hook, swallows `exposeGlobal:false → true` (`core/devtools.ts:72,159-167`) | re-run exposure when the new options expose and the instance is not yet announced | SSR-construct / client-enable test |
| B1 (P1) | false ordering rules ("loader before plugins", "icu before loader") in `src/loader.ts:20-25`, `src/plugins.ts:16-19`, `core/plugins.ts:307`, `plugins/types.ts:20`, fetch-loader `installer.ts:40-42`, `icu.ts:6`, `MIGRATION.md:44`, `react/src/index.ts:56-58`, next `client.ts:24-28` / `server.ts:57-62`, core README | replace with the one true rule: "`icu()` before the FIRST catalog reaches the host; loader/plugins order is free" | new `scripts/prose-guards.test.mjs` (node --test, same shape as `root-changelog.test.mjs`) failing on the retired phrases across README/MIGRATION/src comments — NOT the test manifest (it is a pure test-ID set). **Wired into `test:release-tools`** (`package.json:27`), which the CI `quality` job already runs (`ci.yml:75`) |
| B7 (P1) | `packages/next/src/composedHost.ts:57` plain assignment → enumerable `registerLoader` | `Object.defineProperty`, non-enumerable | reflective-contract test for the next composed host (`{...host}` carries data only) |
| B8 (P2) | 4× capabilityHooks drift (`react/src/capabilityHooks.ts:87-91` coerces `String(result)`, solid binds raw) | one shared core helper, wrappers bind it | cross-wrapper parity test |
- Test-manifest: renamed/removed tests are recorded as `removals[]` / `renames[]` entries with reasons
  in `scripts/wrapper-test-manifest.json`; **no re-snapshot** (fs-p6 §8.3.11: snapshot only after
  publish).
- Gate: `pnpm test:commit`, `pnpm size`, perf §6.5 for B8, `G7: OK`.

## 4. Phase 3 — DX gaps (04.09, ½ day) — P1
- **No `@comvi/core/full`.** Rev 1 proposed it; it is S2, owner-rejected (`comvi-single-entry.md`
  §Options/Verdict). The "0.4 semantics" stay a recipe in MIGRATION (`createI18n({compiler:
  icuCompiler}).with(loader()).with(plugins()).with(devtools())` + `import "@comvi/core/tags"`),
  proven by `composite-parity.test.ts`.
- Nuxt `comvi.icu: true` module option (D1.5): generated default host adds `compiler: icuCompiler`;
  test on the generated `#build/comvi.host`; README §"Composing your host" names it.
- Vue: README states the rule "to compose capabilities use `createCore` + `createI18nFromCore`"
  (`vue/src/createI18n.ts:39-48` returns `VueI18n<D, I18n<D>>`).
- `/tags` scope: one sentence in README + MIGRATION — process-global, retroactive for already-built
  instances (`register-tags.ts:13` → `syntax.ts:138`); `_resetSyntaxExtensions` is internal.
- Docs name the two ICU-always hosts as exceptions: `createNextI18n` and the CDN global.
- Gate: nuxt test-app builds with `icu: true`; `G7: OK`.

## 5. Phase 4 — Gates and maintenance cost (07.09, 1 day) — P1 (AFTER all code phases)
- `scripts/size-budgets.json`: ~12 gated rows (core-base, core-base-icu, core-full-composite; per
  framework default + full-composite; next server-loader; nuxt client), margin **≥ 5 %** on every row
  (drops the 1 B / 30 B ceilings; `core-base-icu` ratchets from 7680 to measured + 5 %). Sentinel
  assertions stay on every kept framework row. The ~34 KB `note` prose moves to
  `scripts/size-budgets.md` (history); JSON notes become one line each.
- One authoritative sweep fills every kept row's `baseline`; the `STALE ANCHOR` (`core-base-loader`)
  and the 8 no-baseline rows are either measured or deleted; no `pending` rows remain.
- Bundler-matrix cases pruned to match the kept rows; `scripts/size-check.test.mjs` updated.
- Bundler-matrix gains `--from-registry <dist-tag>` (½ day): `scripts/bundler-matrix/run.mjs:383`
  today `pnpm pack`s the local packages; the flag swaps the tarball source for `npm pack
  @comvi/<pkg>@<tag>` so Phase 6.1 can run the matrix against what npm actually serves.
- `perf` script added to root `package.json` (the §6.5 protocol) and a `perf` CI job in `ci.yml`
  with the 5 % median threshold; until this lands the protocol runs by hand in Phases 0–2 and its
  medians are pasted into the phase handoff.
- Gate: `pnpm size` green with the new file, seen failing once by lowering one budget by 1 B;
  `pnpm perf` and `pnpm bundler-matrix --from-registry` each seen failing once on a synthetic input.

## 6. Phase 5 — Documentation (07–09.09, 2 days) — P1
- `MIGRATION.md` (60 KB) and the restored core scream changeset → rewritten for users, ≤ ¼ of the
  size; keep: migration table, codemod section, the ICU rule (post-D1), the timing rule, per-binding
  sections. Rationale moves to `.omc/handoffs/`. The generated CHANGELOG is NOT hand-edited (it is
  regenerated at the cut from the changesets).
- Root README: platform recipe first (D1.6), vanilla second; "~5 kB base" stays, add the honest
  platform figures (core ≈ 10 kB, react ≈ 13.5 kB).
- **Platform docs PR** (separate repo, `platform/apps/www/src/content/docs`): 27 files / 64
  occurrences of 0.4-only API (`registerLoader({`, `.use(FetchLoader`, `.use(LocaleDetector`,
  `InContextEditorPlugin(`), 0 mentions of `.with(`/`icuCompiler`. Branch `docs/sdk-0.5`, reviewer:
  owner; merged to `main` on the SAME day as `changeset publish` (after npm is live, before the
  announcement). The develop-push `repository_dispatch` (`ci.yml:399`) is not the mechanism — a
  human merges it.
- Gate: `pnpm format:check`, `prose-guards` test, **G7 allowlist fully re-pinned here** (every
  MIGRATION/README line moved) and `G7: OK` with all mutations verified.

## 7. Phase 6 — Release (owner-gated)
1. **RC rehearsal (target 09.09) — WITHOUT Changesets pre mode.** Pre mode is incompatible with
   the repo's guards: `nextReleaseVersion()` has no prerelease branch (`scripts/sync-peer-ranges.mjs:
   37-53`), so `check-release-plan.mjs:778-782` would fail on `0.5.0-rc.0` on every push
   (`ci.yml:72`), `nextReleaseRange()` writes `^0.5.0` which does not satisfy `0.5.0-rc.0`, and
   `release.yml` publishes only from `push: main` (`release.yml:3-7`, `baseBranch: main`).
   Mechanism instead: a `workflow_dispatch` input `rc: <N>` on the EXISTING `release.yml` (same
   file, so the npm trusted-publisher binding holds), run from `feat/weight-refactor-0.5`. The job:
   checkout → install → build → a new `scripts/rc-version.mjs` sets every `fixed`-group package to
   `0.5.0-rc.<N>` and every internal peer/dependency range to the exact `0.5.0-rc.<N>` **in the
   job's working tree only** (nothing committed, no changeset consumed, main untouched, so
   `check-release-plan` and G7 never see it) → `pnpm -r --filter './packages/*' publish --tag next
   --access public --no-git-checks` (OIDC; `--access public` is REQUIRED — `access: "public"` lives
   only in `.changeset/config.json:22`, no manifest has `publishConfig`, and scoped packages default
   to restricted) → NO GitHub release (`create-combined-release.mjs` is gated on the changesets
   step, which does not run in this path). **Prerequisite step:** the `release.yml` edit adding the
   `rc` input must be merged to `main` FIRST — GitHub reads `workflow_dispatch` inputs from the
   default branch — as a standalone PR before the RC day. Then: install every test-app from npm
   (`@comvi/*@next`), `pnpm build:all`, `pnpm bundler-matrix --from-registry next`, and
   `check:publint` + `check:types-exports` pointed at the installed `@comvi/*@next` tree
   (`pnpm audit:published` is a workspace vulnerability audit, `scripts/audit-published.mjs:20-24`,
   not a packaging check — it stays in the cut checklist, not here). Soak ≥ 5 days; any
   exports-map/publint/attw finding → fix → `rc.<N+1>`.
   **Known, accepted gap:** the RC publishes via `pnpm publish`, GA via `changeset publish`
   (`release.yml:59`); the soak validates tarball contents and the exports map, not the GA publish
   path itself — that path is exercised by `check-release-plan.mjs` (sync-peer-ranges + changeset
   status simulation) on every push and has shipped 0.4.x.
   Scope of `rc-version.mjs`: the 12 `fixed`-group packages (`.changeset/config.json`) → `0.5.0-rc.<N>`;
   `@comvi/locale-routing` is versioned independently (0.1.0 today, not in the group, not ignored)
   → `<its next version>-rc.<N>`, and the exact pins on it in `@comvi/next` / `@comvi/nuxt` follow;
   `@comvi/vite-config` and test-apps are `ignore`d and untouched. `rc-version.mjs` gets a node
   --test file and is seen failing once (wrong range) before use.
2. **Extension live in the Web Store** (submitted in Phase 0). GA does not start until it is
   published; if CWS rejects, fix and resubmit — GA waits.
3. Cut checklist (fs-p6 §8.2, named owner: release captain = repo owner, from the RC-soaked SHA):
   `pnpm test:release` locally (it is NOT a CI job — its constituents are split across `quality` /
   `tests` / `package-contracts`); `check-release-plan` G7 OK; resolve
   `.changeset/core-global-discovery-v2.md:7` by hand ("minimum extension version 0.5.0" + the
   devtools-visibility sentence); merge to `main`; `pnpm release:version` via `changesets/action` on
   the `main` push (`release.yml:54-60`) — the real 0.5.0 uses the normal path, and `npm dist-tag
   add @comvi/<pkg>@0.5.0 latest` is what the action already does; **human read of
   the aggregated CHANGELOG confirming the scream changeset leads every generated core block**
   (fs-p6 §8.2.7); `changeset publish`; platform docs PR merged; announcement.
4. Post-publish: re-snapshot the test manifest (fs-p6 §8.3.11); 6-week observation window with
   `E_ICU_SYNTAX` reports as the tracked signal; CI perf canary (§6.5) stays.
5. **0.4.x policy:** security fixes only, for 8 weeks after GA; no feature backports; the 0.4 docs
   remain reachable under a version switch or an archived page.
6. **Perf protocol (§6.5):** the `core-ng-spike.md` §0 method (fixed inputs, warm-up, 5 runs,
   median) on constructor, `t()` static, `t()` with params, `<T>` prepare — run in Phase 0
   (baseline), Phase 1, Phase 2 (B8); threshold: > 5 % median regression blocks the phase. Added
   as a CI job (`perf` with the same script) in Phase 4.

## 8. Abort criteria and calendar
- Calendar (estimates, single executor + review lanes): P0 31.08 · P1 01–02.09 · P2 02–04.09 ·
  P3 04.09 · P4 07.09 · P5 07–09.09 · RC 09.09 · GA earliest 16.09 (RC soak ≥ 5 days AND
  extension live) — CWS review is the only unbounded item.
- Abort → owner: D1 plumbing > 80 B or > 5 % perf (fallback in D1.3); nuxt `icu` option cannot be
  emitted from the module (fallback: `hostModule`-only, documented); CWS rejection older than
  2 weeks (decide: ship core with a loud "update the extension" note or hold); RC soak finds an
  exports-map defect on the second RC (stop, root-cause the packaging contract before rc.2).

## 9. Post-release backlog (NOT 0.5.0)

- **Nuxt setup-hook DX:** `NuxtI18nSetupContext<C>.i18n` is `VueI18n<{}, C> | C` (client vs
  server), so `i18n.core.*` needs a `'core' in i18n` narrowing in `comvi.setup` hooks. Add
  `core: C` (always the host) to the context — additive, next minor.
- **Move the capability-hooks parity block into core** as `acquireLoaderApi(host)` /
  `acquirePluginsApi(host)` (B8 follow-up); retire `scripts/wrapper-hooks-parity.test.mjs`.
- **Live demo projects (owner idea, 2026-08-29):** publish runnable demos users can try in the
  browser — StackBlitz / CodeSandbox links generated from `test-apps/*` (e.g.
  `stackblitz.com/github/comvi-io/comvi-js/tree/main/test-apps/react`), one per framework, linked
  from README and the docs site. Double duty: the demos install `@comvi/*` from npm, so pointing
  them at the `next` dist-tag during the RC soak is a live registry-tarball test. Needs: each
  test-app self-contained (no `workspace:` deps — a `demo/` variant or a build step that rewrites
  them), a CDN distribution with public sample catalogs, and a decision on where the demo catalog
  lives (public read-only project on the platform). Scope after 0.5.0 GA; format to be agreed.
- `plugin-fetch-loader` weight: 2 634 B gz marginal (7.4 KB min) — the largest chunk on the platform
  path; audit `cache.ts` / `http.ts` / `options.ts` for a lite/lazy cache.
- Dev-time ICU signal from the platform: API exposes `isPlural`/ICU usage per project → CLI
  `typegen` warns and/or emits a runtime artifact (needs a new artifact kind, not the ambient `.d.ts`).
- Platform UI hint on the `isPlural` toggle: "requires `.with(icu())` in the SDK".
- Lazy `import("@comvi/core/icu")` experiment in `fetchLoader` — rejected for 0.5.0 as "automatic".
- Capability-generic `I18nPlugin` host typing (ADR follow-up in `open-questions.md`).
- G7 family for the retired ordering phrases if `prose-guards` proves insufficient.

## 10. Priorities at a glance
P0: Phase 0 (incl. extension submission), Phase 1, B2, B4, RC rehearsal.
P1: B3, B1, B7, nuxt `icu` option, Vue rule, budgets/margins, docs + platform PR, perf gate.
P2: B8, backlog §9.

## 11. Execution mode
Per phase: `/oh-my-claudecode:execute` with `executor` (opus) for code, then a separate `reviewer` /
`verifier` pass against the phase's gate list; `.omc/handoffs/hardening-p<N>.md` records the evidence
(test output, size run, perf medians, grep results, G7 output).

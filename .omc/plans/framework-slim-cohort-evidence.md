# framework-slim — P0.6 audience-proxy artifact (cohort evidence)

**Produced by:** Phase 0 of `.omc/plans/comvi-framework-slim.md` (Revision 6), step P0.6, per the artifact spec in §2.5.
**Captured at:** 2026-08-02, commit `d1fb979` (= tag `framework-slim/pre-wave`), branch `feat/weight-refactor-0.5`.
**Question it answers:** how do wrapper users get translations into the instance — **loader-attached** (a loader lives in the app's module graph) or **inline-catalog / client-hydrated** (no loader; the catalog is supplied at construction or pushed in as data)? The second group is exactly the cohort that a bare-slim wrapper host serves, and the only cohort where D′ beats C on bytes (§2.5).

> **This is a proxy, not telemetry.** Read §8 (Limitations) before quoting any number here. No usage telemetry exists for this SDK; nothing in this file measures the installed base.

---

## 0. Verdict line (feeds the P2 owner gate)

**The inline-catalog/client-hydrated cohort is 29.0% of classifiable evidence (9 of 31 units; 36.0% = 9 of 25 with the loader-plugin's own README excluded), and 4 of 4 quickstarts of the D′ wrappers (react/solid/svelte/vue) are inline-catalog. §2.5 condition (i) — "inline-catalog cohort at <10% of classifiable evidence" — is therefore NOT met, so the decision rule's conjunction cannot fire and D′ is not re-opened at the P2 gate on this evidence. The corpus is first-party only (0 external issues, 0 discussions, npm downloads at bot-noise level), so this artifact bounds plausibility and does not estimate prevalence: per §2.5's honest framing, D′ remains affirmed on architectural option value, not on a measured majority.**

---

## 1. Method

**Classification unit.** One *classifiable evidence unit* = one place that shows (or is) a complete answer to "where does the catalog come from": a runnable app under `test-apps/`, or a fenced code example in a first-party README that contains at least one catalog-provision signal. Prose, API tables, and examples that neither construct a host nor supply a catalog are **not** counted.

**Signals (grep-level, applied to the fence/app source):**

| Cohort | Signals |
|---|---|
| loader-attached | `registerLoader(`, `FetchLoader(`, `attachLoader(`, `@comvi/core/loader`, `@comvi/plugin-fetch-loader`, `loadTranslations(`, `reloadTranslations`, `addActiveNamespace`, `onLoadError(` |
| inline-catalog | `translation:` with a literal catalog, and no loader signal |
| client-hydrated | catalog reaches the instance as **data** — `translation: { [locale]: <runtime value> }` or `addTranslations(<runtime value>)` — and no loader signal |

A unit carrying both a loader signal and a literal catalog is counted as **loader-attached** (the loader is in the module graph — the byte question is settled by presence, not by preference). `inline-catalog` + `client-hydrated` = the **loader-free** cohort (bare-slim-capable).

Every unit is cited `file:line` below; the 9 loader-free hits were additionally read by hand to separate static catalogs from hydrated ones.

---

## 2. Evidence (a) — `test-apps/` (7 apps, one per binding)

| App | Binding | Catalog source | Cohort |
|---|---|---|---|
| `test-apps/react` | @comvi/react | `src/i18n.ts:20` `registerLoader({...})` — 12 dynamic-import entries (6 locales × default+`admin` ns) | loader-attached |
| `test-apps/solid` | @comvi/solid | `src/i18n.ts:20` `registerLoader({...})` — same 12 entries | loader-attached |
| `test-apps/svelte` | @comvi/svelte | `src/lib/i18n.ts:20` `registerLoader({...})` — same 12 entries | loader-attached |
| `test-apps/vue` | @comvi/vue | `src/i18n.ts:2,12` `FetchLoader({ cdnUrl })` (CDN loader plugin) | loader-attached |
| `test-apps/next` | @comvi/next | `src/i18n/config.ts:20` `nextI18n.i18n.registerLoader({...})` | loader-attached (server **and** client — see note) |
| `test-apps/nuxt` | @comvi/nuxt | `app/comvi.setup.ts:8` `i18n.registerLoader({...})` | loader-attached |
| `test-apps/nuxt4` | @comvi/nuxt | `app/comvi.setup.ts:8` `i18n.registerLoader({...})` | loader-attached |

**Count: 7 loader-attached, 0 loader-free.**

**Note (the §4.6 coupling, visible in our own demo).** `test-apps/next` already *hydrates* its client: `src/app/[locale]/layout.tsx:24,29` awaits `loadTranslations(locale)` on the server and passes `messages` into `I18nClientProvider`, which feeds `@comvi/next/client`'s provider — and that provider seeds the instance with `i18n.addTranslations(messages)` (`packages/next/src/client/I18nProvider.tsx:135,146`). The client therefore needs **no loader at runtime**, yet ships one: the same loader-attached instance from `src/i18n/config.ts` is imported into the client component. This is exactly the pattern §4.6 says C forecloses and D′ enables; today it is not expressible because the wrapper demands a root instance (`packages/core/README.md:85-90`).

---

## 3. Evidence (b) — first-party README / docs examples

Corpus: `README.md`, `packages/*/README.md`, `apps/chrome-extension/README.md`. **The live tree contains no `docs/` pages** (the `docs/` tree under `.claude/worktrees/agent-a2eca93f/` is a stale agent worktree, excluded); published docs live off-repo at comvi.io and are out of reach of a repo-grep proxy — recorded as a gap, not as zero.

| Example | Section | Cohort |
|---|---|---|
| `README.md:62` | Quick start | inline-catalog |
| `packages/core/README.md:53` | Quick start | inline-catalog |
| `packages/core/README.md:92` | Slim / pay-for-what-you-use | loader (+ inline seed) |
| `packages/core/README.md:159` | Tags-less graphs: markup stays literal | inline-catalog |
| `packages/core/README.md:306` | Plugins | loader-attached |
| `packages/next/README.md:57` | Quick start | loader-attached |
| `packages/next/README.md:179` | Server-side translation loading | loader-attached |
| `packages/nuxt/README.md:67` | Quick start | loader-attached |
| `packages/plugin-fetch-loader/README.md:50` | Install | loader-attached |
| `packages/plugin-fetch-loader/README.md:57` | Quick start | loader-attached |
| `packages/plugin-fetch-loader/README.md:77` | CDN namespace layout | loader-attached |
| `packages/plugin-fetch-loader/README.md:101` | API mode | loader-attached |
| `packages/plugin-fetch-loader/README.md:126` | Pair with your framework | loader-attached |
| `packages/plugin-fetch-loader/README.md:139` | Pair with your framework | loader-attached |
| `packages/react/README.md:58` | Quick start | inline-catalog |
| `packages/react/README.md:105` | Error Boundaries | inline-catalog |
| `packages/react/README.md:395` | Loading translations from the Comvi platform | loader-attached |
| `packages/solid/README.md:52` | Quick start | inline-catalog |
| `packages/solid/README.md:288` | Loading translations from the Comvi platform | loader-attached |
| `packages/svelte/README.md:52` | Quick start | inline-catalog |
| `packages/svelte/README.md:256` | Loading translations from the Comvi platform | loader-attached |
| `packages/svelte/README.md:300` | SSR (SvelteKit) | **client-hydrated** |
| `packages/vue/README.md:54` | Quick start | inline-catalog |
| `packages/vue/README.md:251` | Loading translations from the Comvi platform | loader-attached |

**Count: 24 units — 15 loader-attached, 8 inline-catalog, 1 client-hydrated.**

Two sub-cuts matter more than the aggregate:

- **Quickstart cut (what a new user copies first).** Of the six binding quickstarts, **4 are inline-catalog** (react `:58`, solid `:52`, svelte `:52`, vue `:54`) and **2 are loader-attached** (next `:57`, nuxt `:67`). The root and core quickstarts are inline-catalog as well. The four inline quickstarts are precisely the four wrappers D′ reshapes — for them, the *documented default* app is a loader-free host.
- **The one hydrated recipe is already the §4.6 shape.** `packages/svelte/README.md:300` (SSR / SvelteKit) builds a per-request instance with `translation: { [data.locale]: data.messages }` from a `load()` function — server fetches, client constructs a loader-free host. Shipped, documented, first-party.

Bias note: `packages/plugin-fetch-loader/README.md` contributes 6 loader units *by construction* (it is the loader plugin's own documentation). Both totals are reported in §7.

Also on record, first-party and unambiguous — `README.md:43`: *"Translations come from inline objects, local JSON, or a CDN/API loader plugin."* Inline objects are a documented first-class path, not a toy.

---

## 4. Evidence (c) — GitHub issues and discussions

**Empty set.** Queried 2026-08-02 against `comvi-io/comvi-js`:

- `gh api graphql` → `issues.totalCount = 0`, `discussions.totalCount = 0`, `hasDiscussionsEnabled = false`.
- `issue://comvi-io/comvi-js?state=all&limit=100` → no matches.
- 62 pull requests exist; every author is `@EugeneBalabai` or `@app/github-actions` — no third-party contributor thread to classify.

There is **no external user-report corpus at all**, so this evidence source contributes 0 units to both cohorts. It cannot be spun as support for either option; it is the strongest single reason this artifact cannot estimate prevalence.

---

## 5. Supplementary — npm downloads (checked, and it carries no signal)

last-month downloads, api.npmjs.org, fetched 2026-08-02:

| Package | Downloads | | Package | Downloads |
|---|---|---|---|---|
| `@comvi/core` | 508 | | `@comvi/next` | 329 |
| `@comvi/react` | 351 | | `@comvi/nuxt` | 331 |
| `@comvi/vue` | 398 | | `@comvi/plugin-fetch-loader` | 384 |
| `@comvi/svelte` | 321 | | `@comvi/plugin-locale-detector` | 323 |
| `@comvi/solid` | 331 | | `@comvi/vite-plugin` | 333 |

The intended test — "is the loader plugin installed far less often than the bindings?" — **fails to resolve**: every package sits in a 321–508 band, including packages no single app would install together (all six mutually exclusive bindings, plus a dev-only vite plugin). That flat profile is the signature of registry mirrors / CI / bot traffic, not of application installs. **Recorded as a negative result: npm data supports no cohort split.** (`@comvi/plugin-fetch-loader` is in any case only one route to a loader — `registerLoader` is core API — so even a clean signal would have bounded only the CDN/API sub-segment.)

---

## 6. Evidence (d) — named app archetypes

Archetypes are *reasoned* assignments, tied to repo evidence where it exists. They bound plausibility; they are **not** counted in §7's percentages.

| Archetype | Cohort | Basis |
|---|---|---|
| **Landing / marketing SPA** (few locales, one small catalog, ships with the bundle) | inline-catalog | The four SPA-binding quickstarts are exactly this app (`react:58`, `solid:52`, `svelte:52`, `vue:54`); a loader would add a network round-trip and a flash-of-untranslated-content for a catalog smaller than the loader code. [reasoned] |
| **Dashboard / product SPA** (many namespaces, per-route lazy load, TMS-managed copy) | loader-attached | All four SPA `test-apps` are this shape — 12 namespaced loader entries in react/solid/svelte, a CDN `FetchLoader` in vue; `@comvi/plugin-fetch-loader`'s "Pair with your framework" section targets it (`:126`, `:139`). [evidenced in-repo] |
| **Browser extension / CSP-locked runtime** (MV3 extension, Cloudflare Worker, locked-down enterprise app) | inline-catalog | The bundled catalog is the norm where remote fetch is reviewed, blocked, or offline; this repo's own positioning sells exactly that audience — "no `eval` … CSP-safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps" (`packages/core/README.md:26`; root `README.md:42` makes the same CSP claim). `apps/chrome-extension` is **not** evidence here: it is the in-context-editor extension that *detects* Comvi on host pages (`apps/chrome-extension/src/content/detector.ts:33`), not an i18n consumer. [reasoned] |
| **SSR app** (next / nuxt / SvelteKit) | **split** — server loader-attached, client loader-free | Server: `next:57,179`, `nuxt:67`, both `test-apps/nuxt*` setups. Client: hydrated from serialized server data — `packages/svelte/README.md:300` (documented today) and `packages/next/src/client/I18nProvider.tsx:135` (`addTranslations(messages)`, shipped today). Per §4.6 the client of an SSR app *is* a bare-slim inline-catalog host — the recipe exists, the wrapper contract does not allow it yet. [evidenced in-repo] |

The archetype cut is why the aggregate percentage understates the loader-free surface: **every SSR app contributes a loader-free client**, and SSR apps are counted here as loader-attached units.

---

## 7. Roll-up

| Scope | Units | loader-attached | loader-free (inline + hydrated) | loader-free share |
|---|---|---|---|---|
| All classifiable evidence (test-apps + README examples) | 31 | 22 | 9 (8 inline + 1 hydrated) | **29.0%** |
| Same, excluding `plugin-fetch-loader`'s own README (6 units, loader by construction) | 25 | 16 | 9 | **36.0%** |
| Binding quickstarts only | 6 | 2 (next, nuxt) | 4 (react, solid, svelte, vue) | **66.7%** |
| Quickstarts of the four D′ wrappers | 4 | 0 | 4 | **100%** |
| GitHub issues + discussions | 0 | 0 | 0 | n/a — empty corpus |
| npm download split | — | — | — | n/a — no signal (§5) |

---

## 8. Limitations (mandatory per §2.5 — read before quoting anything above)

1. **Proxy, not telemetry.** No usage telemetry, no opt-in analytics, no registry-level dependency graph is available for this SDK. Nothing above measures the installed base; it bounds plausibility only.
2. **The corpus is almost entirely our own writing.** 31 of 31 counted units are first-party (`test-apps/` demos and READMEs written by this team). A percentage computed over one's own examples measures *documentation policy*, not user behaviour.
3. **`test-apps/` are feature showcases, not representative apps.** Each demo deliberately exercises namespaces, lazy loading, RTL, plurals and rich text (12 loader entries per app, an `admin` namespace nobody's landing page has). They are biased *towards* loader-attached by design, which is why the aggregate leans loader-heavy.
4. **README examples are biased by section topic.** "Loading translations from the Comvi platform" sections are loader-attached by definition; the fetch-loader README is 6/6 loader by construction. §7 reports the total both with and without it; neither number is more "true" than the other.
5. **Zero external signal.** 0 issues, 0 discussions (feature disabled), 0 third-party PRs, npm downloads indistinguishable from bot traffic (§5). The one evidence source that could have been independent of us produced nothing.
6. **Off-repo docs are not covered.** comvi.io/docs pages (linked from every README) are outside this repo; the live tree has no `docs/` directory. A grep-based proxy cannot see them. Unknown, not zero.
7. **Cohort membership is not static.** An app can move between cohorts by adding one `registerLoader` call. The classification describes a *snapshot of graphs*, not a durable property of users, and an app's server and client can sit in different cohorts simultaneously (the SSR row in §6).
8. **The percentage is unweighted.** A one-line README fence and a full demo app count as one unit each. There is no traffic, install, or LOC weighting available to do better.
9. **What would replace this artifact:** the R1 post-release signal (§8 risk register, R5/R1) and the §5 observation window — capability-error issue counts and codemod manual-report feedback after 0.5.0 ships. Those are real user data; this file is not.

---

## 9. Cohort decision table — C vs D′ (from plan §2.5; byte columns are CI-gated measurements)

| | C (composed contract) | D′ (chosen) |
|---|---|---|
| Loader-attached cohort — bytes | −1708 B | −1708 B (identical) |
| Inline-catalog cohort — bytes | −1708 B (ships +1147 B dead loader/plugin code) | −2855 B |
| Migration sites (both cohorts) | ~0 user sites (accept-retypes only) | 4 renames/wrapper + vue `i18n.core.*`; codemodded (§3.1) |
| Bare-slim feasibility | structurally impossible, permanently | supported |
| Second-wave risk | C→D′ later = a SECOND breaking wave | D′→typed-factory sugar = additive |
| Server-root(/loader)/client-slim pattern (§4.6 — ships this wave) | foreclosed (client must ship loader/plugin code) | enabled; client is exactly a bare-slim inline-catalog host |

**Provenance of the byte numbers** (plan §2.1 — core-entry min+gz, produced by `scripts/size-check.mjs` bundling through the published exports maps). **Re-verified live at this commit** (`node scripts/size-check.mjs`, 2026-08-02): `full` **8583 B**, `slim` **5728 B**, `slim-loader` (slim + `/loader` + `/plugins`) **6875 B**. Hence −2855 B for a bare-slim host, −1708 B for a loader-attached one, and a **1147 B** marginal margin that exists **only** for the loader-free cohort. Framework-level (`fw-*`) fixtures land in P0.1–P0.2 and are the numbers any release-facing claim must quote — the rows above are core-graph deltas, and §2.1's `≈` rows stay non-claimable until the P0.9 composed fixtures are green.

**Cohort pricing against this artifact's counts:** applying the 9-of-31 split to the marginal byte margin, the evidence-weighted expectation is ≈`0.29 × 1147 B` ≈ **333 B/app** that C would waste on average across this corpus — but note limitation 2 before treating that as a portfolio number: it is an average over our own examples, not over an installed base.

---

## 10. Decision rule (verbatim from plan §2.5) and its evaluation here

> **Decision rule.** D′ stands (per the standing lead decision this revision does not relitigate). It is re-opened at the P2 owner gate ONLY if BOTH: (i) the P0.6 proxy classifies the inline-catalog cohort at <10% of classifiable evidence, AND (ii) the P0.7 feasibility fixtures fail to validate the server-root/client-slim growth path. **Honest framing:** if the proxy cannot estimate prevalence, D′ is affirmed as **architectural option value** — C forecloses bare-slim wrappers forever and makes any correction a second breaking wave, while D′'s cost is one-time and largely codemodded — NOT because the mandate empirically identifies today's majority. R1's post-release signal feeds the 1.0 decision on a defined window (§5).

**Evaluation.**

| Condition | Status |
|---|---|
| (i) inline-catalog cohort < 10% of classifiable evidence | **NOT MET.** Measured 29.0% (9/31); 36.0% excluding the loader-plugin README; 100% of the four D′ wrappers' quickstarts. The margin to the 10% trigger is ~3×, and no defensible re-cut of the corpus reaches it — even counting *only* the seven loader-heavy `test-apps` plus the fetch-loader README would be a deliberate exclusion of the four binding quickstarts, i.e. of the documented default app. |
| (ii) P0.7 fixtures fail to validate the server-root/client-slim growth path | **Not yet determined** (P0.7 lands `fw-next-*` / `fw-nuxt-*` `pending:true` slots this phase; graduation is P4/P5). |

Because the rule is a conjunction and (i) fails, **the rule cannot fire regardless of (ii): D′ is not re-opened at the P2 owner gate on the strength of this artifact.** The P2 gate still reviews it as evidence (§4 Phase 2 checkpoint), and the P0.7 detail decisions are recorded there.

**And the honest half of the framing still applies, unchanged:** this proxy *cannot* estimate prevalence (§8, esp. limitations 2 and 5). D′ therefore stands on **architectural option value** — C forecloses bare-slim wrappers permanently and makes any later correction a second breaking wave, while D′'s cost is one-time and largely codemodded — **not** on a demonstrated majority of today's users. Any release-facing text that turns 29.0% into "most of our users" would be exactly the mislabeled rhetoric R10 exists to prevent.

---

## 11. Reproduction

```bash
# (a) test-apps cohort scan
grep -rnE "registerLoader|FetchLoader|attachLoader|addTranslations|translation:" test-apps --include="*.ts" --include="*.vue"

# (b) doc examples: fenced blocks carrying a catalog-provision signal
#     corpus = README.md packages/*/README.md apps/chrome-extension/README.md
#     loader  = registerLoader( FetchLoader( attachLoader( @comvi/core/loader
#               @comvi/plugin-fetch-loader loadTranslations( reloadTranslations
#               addActiveNamespace onLoadError(
#     inline  = "translation:"  addTranslations(
#     the 9 loader-free hits were then read by hand to split inline vs client-hydrated

# (c) external corpus
gh api graphql -f query='{repository(owner:"comvi-io",name:"comvi-js"){
  discussions(first:1){totalCount} issues{totalCount} hasDiscussionsEnabled}}'

# (5) npm downloads
for p in @comvi/core @comvi/react @comvi/vue @comvi/svelte @comvi/solid \
         @comvi/next @comvi/nuxt @comvi/plugin-fetch-loader; do
  curl -s "https://api.npmjs.org/downloads/point/last-month/$p" | jq -r '"\(.package) \(.downloads)"'
done
```

# The site loads the in-context editor; the browser extension only asks

Status: accepted · Date: 2026-10-11 · Owner decision(s): COM-140 — the site, not the extension,
inserts the editor's `<script>`, 11.10.2026

Status: amended · Date: 2026-10-27 · Owner decision(s): R3-14, R3-15, R3-16 of the 0.8 design —
protocol 2, the thin hook, the extension as the only path. The 0.6–0.7 loader slot (CSP
diagnostics, timeout, hourly salt, `editorVersion` pin, v1 registry, minted ids) is replaced; the
Decision below is the 0.8 one, and the slot is summarised under Context.

## Context

Until 0.6.0 the Chrome extension carried a copy of the standalone editor and injected it with
`chrome.scripting`, so every editor fix needed a new store submission and a review, and the copy on
a translator's machine lagged the SDK on the site. Manifest V3 forbids an extension from loading
remote code itself, which rules out the extension fetching the editor from a CDN. The site's own
page is under no such rule: a `<script>` the page inserts is first-party code, and the page already
composes `devtools()` when it wants the extension to find it. Three constraints: the extension
ships no editor and loads no remote code; a site that never asked is untouched (no bytes, no
network); the API key stays in the extension.

0.6–0.7 met them with a page-level loader slot of about 0.7 kB (CSP diagnostics, a timeout,
cross-copy dedupe, an hourly cache salt, a v1 registry, minted instance ids). `devtools()` ships
to every visitor of a site that composes it, the editor only to the translator who opens it, so
0.8 moves everything that can live in the extension or the editor out of core (R3-15).

## Decision (0.8, protocol 2)

- **One queue entry, nothing else on the page.** In a browser, `plugins: [devtools()]` pushes
  `{ v, i, x }` onto `window.__COMVI__` (creating the array when there is none) and `destroy()`
  splices that same entry out; without a window it does nothing. Core calls only `push`, `indexOf`
  and `splice` on the global, makes no probe of its shape, mints no id and keeps no
  `Symbol.for(...)` slot (`contracts/chrome-extension-proxy.json`, `discovery`). An app that never
  composes `devtools()` is invisible to the extension and carries none of this code.
- **The handle `x`** (`contracts/chrome-extension-proxy.json`, `handle`): `p: 2`, `kind: "comvi"`
  (an editor picks its driver by both and refuses a kind it does not know), `read(ns, locale)`,
  `state()`, `mark(fn | null)` and `load(version?)`. `read`, `state` and `mark` are thin
  delegates to the instance.
- **Marking lives in the core's `translate`, only under a session.** `x.mark(fn)` sets the
  state's marking hook and publishes a new state, so every binding re-renders marked; `mark(null)`
  publishes again unmarked. The hook runs for found and missing keys; `{ markers: false }` on a
  call and `markers={false}` on a binding's `<T>` are checked before it. An instance without
  `devtools()` has no handle and is never marked; without a session `t()` keeps its fast path.
- **`x.load(version?)` resolves when the editor's global is on the page.** `version` is an exact
  version or `latest` (the default), never a URL; core inserts one `<script>` from
  `https://cdn.jsdelivr.net/npm/@comvi/editor@<version>/dist/standalone.iife.js` — host and path
  are core constants. Anything else rejects, and nothing throws synchronously (a Trusted Types
  refusal of the `src` is a rejection). The contract is "the global is available", not "a
  jsDelivr script was inserted", so a bundled editor can satisfy it later without a protocol
  change (R3-16).
- **The extension owns the rest.** It installs its CSP listener before calling `x.load()`, skips
  the call when the editor is already on the page, bounds it with its own timeout, and passes the
  exact editor version compatible with `x.p` (no cache salt is needed for an immutable file). It
  never builds a URL and never inserts a script (the CWS rule above). These duties and their tests
  move to the extension and the editor (lot 8).

## Consequences

- **Release order is fixed.** The extension release that speaks protocol 2 is published to the
  Chrome Web Store before `@comvi/core` 0.8 is published to npm: an extension that looks for the
  0.7 slot reports `no-loader` against a 0.8 site.
- **Bytes.** `devtools()` adds about 360 B min+gz to `core-icu` (it was about 1.1 kB), the
  marking hook about 40 B to the base (`scripts/size-budgets.md`, 2026-10-27 lot 1e).
- **A site with a Content Security Policy must allow `https://cdn.jsdelivr.net` in `script-src`**,
  and a site that enforces Trusted Types needs a `default` policy whose `createScriptURL` accepts
  that URL, since `x.load` assigns `script.src` as a plain string. A site that cannot allow the
  host has no editor in 0.8 (R3-16).
- **No editor without the extension.** 0.8 has no npm editor mode and no `devtools({ editor })`
  option (R3-16): one line, no `DEV` condition, no key in the bundle. Browsers without the
  extension, and Next server components, are not editable in 0.8.
- **The trust boundary does not widen.** `x.load()` is page code called by extension code. A
  hostile page can present its own `ComviInContextEditor`; that fake then receives the proxy
  transport, which is the substituted-editor case the extension README already documents. The
  extension never loads a URL the page names, and the key, the single-use nonce and the route
  contract stay in the service worker and the isolated world.

## Alternatives rejected

- **Keep bundling the editor in the extension** — every editor fix waits for a store review, and
  the translator's copy lags the site's SDK.
- **Keep the 0.7 loader slot in core for old extensions** — it is most of the bytes R3-15 removes;
  0.8 is a new library with no users of the old pairing (R3-11), so the release order above is
  the cheaper fix.
- **An npm editor mode or `devtools({ editor: () => import(...) })`** — rejected for 0.8 (R3-16);
  it can return additively because `x.load` promises the global, not the script.
- **The extension creating the `<script>`** — then the extension loads remote code under its own
  identity, which Manifest V3 forbids.

## Where it lives

- the hook — `packages/core/src/devtools.ts`; the marking hook — `State.mk` in
  `packages/core/src/state.ts` and `translate` in `packages/core/src/instance.ts`
- the contract — `contracts/chrome-extension-proxy.json` (`discovery`, `handle`)
- what moved to lot 8 — `.lot1-pending-tests.md` (until lot 8 lands)

## Related

- `apps/chrome-extension/README.md` — the security model this record's trust-boundary statement
  is copied from.

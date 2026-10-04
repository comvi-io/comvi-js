# Limitations: everything the library does not do

Status: accepted · Date: 2026-09-14 · Owner decision(s): stays a user-facing page rather than a
decision record, and is mirrored on comvi.io, 14.09.2026

One list, so a reader evaluating Comvi i18n finds the gaps in one place instead of discovering them
one README at a time. Each entry says what happens instead, because a limitation you can see is
cheaper than one you hit in production.

The host is the object `createI18n` returns: it holds the catalog, the current locale and `t()`.

## ICU grammar

- **`number`, `date` and `time` argument types are not implemented, and are not planned.**
  `{price, number}` fails with `E_ICU_SYNTAX` rather than rendering something wrong. Format the
  value in code and interpolate it as a plain `{param}`, or quote the braces (`'{'…'}'`) to keep the
  text literal. Reasoning: [formatting.md](formatting.md#alternatives-rejected).
- **The plural `offset:` form is not implemented.** Drop `offset:` and write the branches out.
- **`plural`, `selectordinal` and `select` are the whole of what the compiler implements**, each with
  a choice list. See [icu.md](icu.md#decision).
- **A missing interpolation parameter renders as its own placeholder.** `t("greet")` on
  `"Hello, {name}!"` gives `"Hello, {name}!"` in 0.5, where 0.4 gave `"Hello, !"`, plus one
  development warning per template and parameter. An explicit `null` still renders as an empty
  string. Opt out with `missingParam: "drop"`. This is 0.5's most visible behaviour change; the
  [root README](https://github.com/comvi-io/comvi-js#upgrading-from-04x) lists it among the four.
- **ICU is off unless you name it.** Without `compiler: icuCompiler` a plural throws in development
  and renders literally in production. This is a choice, not an omission — the alternative is a
  plausible wrong answer — but it is the single most common first surprise.

## Server-side rendering

- **Solid: server-side LOADING is not supported.** `<I18nProvider>` initializes from a
  `createEffect`, and effects do not run during Solid's server render, so a catalog a loader would
  have fetched is absent server-side. An inline catalog renders fine.
  [Track progress in the issues](https://github.com/comvi-io/comvi-js/issues).
- **The module-scope rule is not the same in every framework.** Next requires one shared host; Solid,
  Svelte, Vue and Nuxt each forbid it. Full table: [ssr.md](ssr.md).
- **Ambient string-API tags must be imported in both bundles.** One import registers the grammar per
  bundle, and an SSR app has two. See [rich-text.md](rich-text.md).

## Rich text

- **`<T>` maps only the tags you give it.** A tag with no mapping falls back to its inner text. There
  is no HTML passthrough, by design — there is no HTML sink anywhere in the render path.
- **`t()` does not parse tags unless `@comvi/core/tags` is imported**, and that import is
  process-wide and retroactive, with no per-instance opt-out.

## Platform features

- **The in-context editor needs a Comvi account.** `@comvi/plugin-in-context-editor` requires the
  [Comvi platform](https://comvi.io) and does not work standalone. Its production entry is a no-op
  installer, so a production build that composes it carries no editor bytes.
- **The browser extension must be 0.5.0 or newer.** `window.__COMVI__` is protocol v2, and an older
  extension does not speak it. Discovery is opt-in either way: `.use(devtools())`. See
  [Devtools API](https://comvi.io/docs/i18n/api/core-devtools).
- **`cdnLoader` reads a public distribution only.** Draft translations, private projects and
  auth-gated content need API mode: `fetchLoader` from the package root plus an `apiKey` on the
  host. The root entry carries the API request path in the bundle either way, which is why the
  CDN-only subpath exists.

## Tooling

- **There is no migration tool.** Moving from another library is a by-hand edit; the
  [migration guides](https://comvi.io/docs/i18n/guides/migrate-from-i18next) table the renames.
- **Vue and Svelte template markup is edited by hand.** `<T raw>` inside a template is the rename
  a reader has to make themselves.
- **Typed keys are generated, not inferred.** `TranslationKeys` is a declaration-merging interface;
  `@comvi/cli` (from the platform) or `@comvi/vite-plugin` (from local JSON) writes it. Nothing
  infers key types from a runtime catalog.
- **Generated types augment the Comvi package your app declares, so switching packages means
  regenerating.** The generated file carries `declare module '<that package>'` and names it in its
  header. `@comvi/core` wins when your `package.json` declares it; otherwise it is the framework
  binding (`@comvi/react`, `@comvi/next`, `@comvi/vue`, `@comvi/nuxt`, `@comvi/svelte`,
  `@comvi/solid`). Declare none of them and both generators refuse rather than write an inert file.
  Point them somewhere else — a private wrapper package that re-exports a binding — with `augment`
  in `.comvirc.json` or the `augment` plugin option.

  The rule reads your manifest and nothing else. It does not look at `node_modules`, because what
  an app DECLARES is the one specifier it is certain to resolve: the documented install is a single
  package, core arrives through it as a transitive dependency that a strict pnpm layout will not let
  the app name, and Yarn PnP has no `node_modules` to inspect at all. Reading the manifest also
  makes the answer identical on every machine, which is what lets `comvi typegen --check` regenerate
  the same file the write path produced.

  That the augmentation reaches `t()` through a binding is measured, not assumed:
  `tests/types-keys-via-binding` in each of the six binding packages is an isolated TypeScript
  program that augments `TranslationKeys` through that package and fails if a declared key stops
  compiling OR an undeclared one starts. `pnpm check:strict-consumer` proves the same thing from
  outside, in a temp app that declares one package under a layout that hoists nothing.

## Typed keys: three shapes `t()` does not check

`t()` has one call signature, which is what makes a wrong call report the real problem on its first
line (see the [root README](https://github.com/comvi-io/comvi-js#reading-the-type-errors)). Three
shapes fall outside it. Each is a consequence of that one signature, not a bug to be fixed in
isolation.

- **A key the call site could not narrow to one literal gets loose params.**
  `t(cond ? "greeting" : "farewell")` compiles even when `greeting` declares required params, and
  so does a params object valid for neither arm. The key itself is still checked: an arm that is
  not a key is rejected. Narrow the key first (`const key = cond ? "greeting" : "farewell"` does
  not help; branch the CALL instead) when the params differ between arms. Closing this needs the
  arms' params intersected, which costs the check on `t("key", { ns })` — a silently accepted wrong
  namespace, which is worse.
- **`Parameters<typeof t>` is `never` once keys are generated.** The key parameter's type depends on
  a second, inferred type parameter, and `Parameters` cannot see through that. Reach the argument
  list through `ArgsFor<"your.key">` instead, which resolves normally. With no generated keys
  `Parameters` still works.
- **`t` is not assignable to a `(key: string) => string` callback once keys are generated.** The key
  is a closed union of your keys, and `string` is not one of them. Hand such a helper
  `t as (k: string) => string`. The two-argument shape
  `(key: string, params?: Record<string, unknown>) => string` never accepted `t` and still does not.

## Deprecated surface, and when it goes

Four members on `useI18n()` are declared as optional `never` in react, solid, svelte and vue, so
`if (bag.reloadMessages)` compiles and is always false. Acquire them from `useI18nLoader()` /
`useI18nPlugins()` instead. Those declarations, `<T raw>`, `allowedTags?: never` on svelte's `<T>`,
`ssrInitialLocale` on `@comvi/react` and `CDN_BASE_URL` on `@comvi/plugin-fetch-loader` are all
**removed in 0.6**. `CDN_BASE_URL` is the one that was never read: `cdnUrl` is a required option
with no default and no environment override, so the constant answers a question the loader does not
ask. The hosted CDN default stays readable as `comviPreset.cdnBaseUrl`.

## Memory

- **A catalog is never evicted.** Everything `addMessages` and a loader merge into a host stays
  in its translation cache until `clearMessages()` or `destroy()`. The three caches that ARE
  bounded — compiled templates, `Intl` formatters and plural rules — hold 1000 entries each, FIFO,
  and are shared by every host in the process; that is an ENTRY limit, not a byte limit, so 1000
  long messages cost more than 1000 short ones. A client app with a fixed set of languages therefore
  has a bounded model and nothing here to tune. A long-lived server that loads many locales or
  namespaces into ONE host needs a lifecycle instead of a limit — and which code provides that
  lifecycle differs by framework:
  - **`@comvi/nuxt` destroys its per-request hosts for you**, from a Nitro hook once the request is
    answered.
  - **A per-request host you build yourself — Vue SSR, Solid, Svelte — is discarded and collected,
    which is not the same as destroyed.** Collection frees the catalog; it never runs a plugin's
    cleanup. If your plugins hold anything (an interval, a socket, a subscription),
    `await i18n.destroy()` when the render is done. Nothing in the library does it for you.
  - **The shared `@comvi/next` server host** holds every catalog it ever loaded for the life of the
    process.

  See [ssr.md](ssr.md).

## Environment

- **Node 20 or newer** for the runtime packages; **Node 22 or newer** for `@comvi/cli` and
  `@comvi/vite-plugin`. Exact ranges are each package's `engines` field.
- **Peer ranges** are each package's `peerDependencies` field, and the install line in each README
  quotes it. Svelte is `^5.3.0` — Svelte 4 is not supported, because the bindings use runes.
- **No `eval` and no `new Function`** in any runtime package, so every package runs under a strict
  CSP without `unsafe-eval`. This is a gate, not a claim: a dist test asserts it.

## Not on the roadmap

Listed so nobody waits for them: an ICU format grammar (see above), a runtime
translation-memory/fuzzy-match layer, and automatic key extraction from source. Key extraction is
the platform's job, not the library's.

## Related

- [Composition](composition.md) · [ICU](icu.md) · [Rich text](rich-text.md) ·
  [Formatting](formatting.md) · [SSR](ssr.md) · [Next.js runtimes](next-runtimes.md)

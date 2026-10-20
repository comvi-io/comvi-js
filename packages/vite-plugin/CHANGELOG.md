# @comvi/vite-plugin

## 0.6.0

### Patch Changes

- 1fb2046: Generated types accept a number for a bare `{name}` and for a `select` variable: such a parameter is now `string | number`, not `string`. `t("errors.count", { count: 3 })` against `"Reported misses: {count}"` no longer fails `tsc`; the runtime always rendered it. A `plural` or `selectordinal` count stays `number`. `comvi typegen` and `comviTypes()` still write byte-identical files, so a file with such a parameter has to be regenerated once after upgrading, or `comvi typegen --check` reports it as stale.

## 0.5.0

### Minor Changes

- 09029b0: Type generation now runs on one shared emitter, the same one `@comvi/cli` uses, so the two tools cannot drift. The emitter is workspace-private and is bundled into this package — **no new dependency, nothing extra to install**, and `EmitOptions`, `SchemaParam`, `KeySchema` and `ProjectSchema` are still declared by this package's own types. The header line is unchanged, and so is every type the declarations carry.

  **The declarations themselves change once, so regenerate and commit the result in the upgrade commit.** Two differences, both fixes the shared emitter brings with it:
  - **Keys and parameter names are quoted with `JSON.stringify`** where the plugin emitted single quotes and bare parameter names. 0.4.1 wrote `'errors.it's': never;`, which closes its own quote, and `{ user-name: string }`, which is not a legal property name; neither file parses. They are now `"errors.it's"` and `{ "user-name": string }`.
  - **Keys are sorted in code-unit order** (`Object.keys().sort()`) where the plugin sorted with `localeCompare`. The two orders disagree on any pair that differs only in case, so `apple` / `Apple` swap places. The CLI has always used code-unit order, and this is what made the two tools' output differ.

  One behaviour follows from the shared copy: two keys that converge once the default namespace is stripped are now refused with a `Translation key collision` error. The plugin used to keep whichever key came last, so a key disappeared from the declarations silently. `@comvi/cli` has always refused it. During a build the refusal throws, so a schema that built yesterday can fail `vite build`; `vite dev` reports it and carries on.

### Patch Changes

- 09029b0: `publishConfig.access` is now declared as `public` in every published manifest.

  `access: "public"` previously lived only in `.changeset/config.json`, so it applied to
  `changeset publish` and nothing else. Any other publish path had to remember `--access public`
  or npm would refuse the scoped package as private. The declaration now travels with each
  manifest. No code changed.

- 09029b0: The shipped `.d.ts` files now use extension-qualified relative specifiers (`./options.js`,
  `./cdn/index.js`), so the published types resolve under `moduleResolution: node16` and
  `nodenext` — the mode a Node ESM package or a `"type": "module"` app gets by default.

  Previously every relative specifier in the emitted declarations was extensionless, inherited
  verbatim from sources written for `moduleResolution: "bundler"`. Bundler resolution
  substitutes extensions; node16 does not, and it has no directory-index lookup either. The
  damage had two shapes, and only one of them was loud:
  - The `@comvi/plugin-fetch-loader` entry that carries `cdnLoader` was built as
    `export * from './cdn/index'`. A star re-export from an unresolved module contributes no
    names, so the entry point had **zero exported members**, and importing `cdnLoader` failed
    with `TS2305 ... has no exported member 'cdnLoader'`. `@comvi/core` and
    `@comvi/plugin-in-context-editor` had the same shape on `export type * from './types'` and
    `export * from './entry-production'`.
  - Every other entry used named re-exports (`export { X } from './options'`). Those keep the
    name but bind it to an unresolved module, so `X` silently became `any`. With the
    `skipLibCheck: true` nearly every app sets, a node16 consumer got **no diagnostic at
    all**: `createI18n(123)` type-checked. The packages looked typed and checked nothing.

  **On upgrade, a `node16`/`nodenext` project may see NEW type errors in its own code.** Those
  errors were always there — the types that would have reported them were `any`. Code written
  against the real signatures needs no change.

  Bundler-resolution consumers (Vite, and Next.js projects on the `bundler` default) were
  never affected — their types were correct throughout. Consumers on `node16`/`nodenext` get
  real types for the first time, with one exception outside our control: `@comvi/next`'s
  middleware and routing declarations import `next/server` and `next/link`, and `next@15.5.9`
  ships no `exports` field, so those subpaths still do not resolve under `node16` (3 ×
  TS2307 raised inside `@comvi/next`'s own declarations). Next.js projects on the `bundler`
  resolution its own tooling sets are unaffected.

  `pnpm check:types-exports` now gates attw's `node16` resolution mode in addition to
  `bundler`. attw detects this defect perfectly well — 10 × `InternalResolutionError` on
  `@comvi/plugin-fetch-loader` alone, `./cdn/index` among them. It was a single line in the
  repo's own wrapper that suppressed the entire node16 report, so the gate was green on a
  broken tree. The gate also grew a small probe for the one thing attw cannot reach: attw
  resolves entry points with a fixed condition set, so a `types` branch under a custom
  condition — `@comvi/plugin-in-context-editor`'s `"types": { "production": … }` — is never
  visited, and that is exactly where `export * from './entry-production'` was hiding.

  `@comvi/svelte` and `@comvi/nuxt` were previously excluded from that gate as "covered by
  publint". They were not: publint validates the manifest, not resolution inside a declaration
  file, and printed "All good!" on both broken trees. Every published package is now gated.

  Follow-up, deliberately NOT in this release: the declarations are corrected by a post-build
  rewrite (`tooling/qualify-dts-specifiers.mjs`) wired into each package's build. Writing the
  `.js` extension in the SOURCES instead is legal under `moduleResolution: "bundler"` and is
  emitted verbatim, which would let the rewriter be deleted and would cover `svelte-package`
  and `nuxt-module-build` without per-package wiring — one mechanical sweep over 566
  extensionless relative imports across 161 files. Neither `moduleResolution: node16` in the emitting
  tsconfig nor `rewriteRelativeImportExtensions` is a substitute.

- 09029b0: The two packages 0.5 extracted so that shared code has one copy — locale routing (next, nuxt) and the declaration emitter (cli, vite-plugin) — stay internal to the repository instead of being published. Each of these four packages now carries the shared implementation inside its own build, so **none of them gained a runtime dependency**: next bundles the routing primitives, nuxt ships them vendored into its runtime, and cli and vite-plugin bundle the emitter along with its declarations, so their published `.d.ts` still declare `SchemaParam`, `KeySchema` and `ProjectSchema` themselves. Nothing about the four packages' APIs changes and nothing extra is installed; the release train is 12 packages on one version.
- 09029b0: Generated types now augment the Comvi package your app declares, so a one-package install gets working keys. The declaration used to augment `@comvi/core` unconditionally, but the documented install adds only a framework binding and core arrives through it as a transitive dependency — under pnpm's strict layout or Yarn PnP the app cannot resolve it, the augmentation attached to nothing, TypeScript reported TS2882 on the generated import, and `skipLibCheck: true` hid that while every unknown key type-checked.

  The target is read from your `package.json`: `@comvi/core` when you declare it, otherwise `@comvi/react`, `@comvi/next`, `@comvi/vue`, `@comvi/nuxt`, `@comvi/svelte` or `@comvi/solid`. The generated header names it. Nothing extra to install, and nothing is resolved from `node_modules`, so the answer is the same on every machine and `comvi typegen --check` regenerates the same file the write path produced. Declare none of them and both tools refuse instead of writing an inert file. Set `augment` in `.comvirc.json`, or the `augment` plugin option, to name another module such as a private wrapper package that re-exports a binding.

  The rule reads the `dependencies` and `devDependencies` of that one `package.json`. Declaring the package in a workspace root or under `peerDependencies` is not enough: the app's own manifest must list it, or `augment` must name the module. If your app relied on a hoisted copy it never declared, generation now fails until you add it — which is the dependency you were already importing.

  Regenerate once after upgrading: the header line changed and `--check` compares it.

- 09029b0: Generated declaration files now carry one tool-neutral header, so `comvi typegen --check` no longer reports drift on a file the Vite plugin wrote. The two tools each stamped their own name on header line 3, and the check compares the file on disk against fresh output literally — a project generating types with the plugin in dev and checking them with the CLI in CI failed the check on every run, with no regeneration able to clear it. The header line is now dropped from both sides of the comparison in every wording that has shipped, so it can never be the reason for a stale verdict again.

  Regenerate once after upgrading and commit the result: a file written by 0.4 still compares as outdated, because 0.5 quotes keys and parameter names with `JSON.stringify` where 0.4 emitted single quotes and bare names, and the comparison does not normalize quoting.

- 09029b0: Type generation now reads ICU exactly as the runtime does, so the generated parameters are the ones your messages actually consume. Seven forms disagreed before: `{ name }`, `{name x}` and `{0} items` are real parameters at runtime but were typed as taking none; `{price, number}`, `{when, date, short}`, `{n, pluralx, …}` and any of `plural`/`select` with a malformed choice list produced a required parameter although `@comvi/core` implements no such argument type and refuses the whole key; and `a { b {name}` invented `name`, where an unclosed brace makes the rest of the message literal text.

  A key whose message carries ICU syntax core does not implement now generates no parameters and is reported during generation, naming the key, the file and the argument type. It stays a key — you can still call it — instead of demanding an argument at a call that would throw.

  The reading is pinned by a parity test that drives every message form through `@comvi/core`'s own compiler and compares the parameters it consumes, so a change to core's grammar fails the build instead of silently desynchronizing your types.

- 09029b0: **Text inside a plural or select branch is no longer generated as a required
  parameter.** The extractor scanned every `{…}` in a message, so the branch
  bodies of an ICU argument became parameters of their own:

  ```jsonc
  // en.json
  { "greeting": "{gender, select, male {he} other {they}}" }
  ```

  ```ts
  // generated before: he and they are not parameters, and strictParams made
  // them required — so every call site failed to typecheck
  "greeting": { "gender": string; "he": string; "they": string };

  // generated now
  "greeting": { "gender": string };
  ```

  The same happened to any plural whose branches are words rather than `#…`:
  `{count, plural, one {item} other {items}}` produced `item` and `items`.

  Only branch text changes. An argument whose type the extractor does not
  recognise, such as `{x, wobble, other {a}}`, still contributes no parameter of
  its own — as before — and now no longer contributes the `a` from its branch
  either.

  Placeholders that really are nested inside a branch are still found:
  `{count, plural, other {# of {total}}}` keeps both `count` and `total`.

  Re-run your build to regenerate the declaration file. If your code passes the
  phantom parameters today, those arguments become excess properties and can be
  deleted.

- 09029b0: Type generation now reads ICU apostrophe quoting the way the runtime does, so a quoted placeholder no longer becomes a required parameter. A message like `'{name}' stays literal` renders those five characters as text and consumes nothing, but the extractor still asked for a `name` string — the generated types demanded an argument the message would ignore, and a key whose placeholders are all quoted could not be called without inventing values. Quoted sections are skipped when scanning for placeholders and when matching braces, `''` is one literal apostrophe, and `'#'` opens a quote only inside a plural or selectordinal branch, where `#` is syntax.
- 09029b0: Declarations are written atomically and an identical regeneration after a failed write now writes the file. Keys named `__proto__`, `constructor` or `prototype` are kept, and an `augment` option that is not a module specifier is refused.
- 09029b0: **Generated declarations are valid TypeScript for every key, and match the CLI's output
  byte for byte.** Key and parameter names are emitted as JSON strings, so a key containing an
  apostrophe (`errors.it's`) no longer closes its own quote, and a parameter named `user-name`
  is no longer emitted as a bare identifier.

  Keys are ordered by code unit rather than by `localeCompare`, which is what `@comvi/cli`
  already did — generating types with the plugin in dev and with the CLI in CI no longer
  produces two files that differ only in key order.

  A parameter whose type is neither `string` nor `number` is rejected with an error naming the
  key, the parameter and the type, instead of being pasted verbatim into the declarations.
  `vite build` fails on it; the dev server logs it and keeps the previous `.d.ts` rather than
  stopping.

## 0.4.1

## 0.4.0

## 0.3.0

### Minor Changes

- 6e5370c: **BREAKING: these packages are now ESM-only.**

  v0.3 targets the modern bundler-resolution toolchain. The CJS build (`require()` entry / `main` / `.cjs`) and the dual `.d.cts` type declarations are no longer published — each package ships a single ESM bundle plus one `.d.ts` per entry. Import via ESM or any modern bundler (Vite, webpack 5, esbuild, Rollup, Rspack, Next, etc.).
  - **Migration:** replace `const x = require("@comvi/…")` with `import x from "@comvi/…"`, or consume through a bundler. There is no `require()`/CJS entry point.
  - The CDN UMD/IIFE builds are unaffected: `@comvi/core` still ships `comvi-core.global.prod.js` (`unpkg`/`jsdelivr`), and `@comvi/plugin-in-context-editor` still ships `standalone.iife.js` (`./standalone`).
  - This removes the `emit-d-cts.mjs` post-build stopgap and all dual-format machinery; declarations are produced directly by the build (`vite-plugin-dts`) and resolve cleanly under bundler resolution.
  - `@comvi/solid` declarations are now correctly populated (`tsconfig` `rootDir`/`outDir` restored — previously the advertised `dist/index.d.ts` was an empty `export {}` stub).
  - Package metadata: `repository.url` carries the required `git+` prefix.

- c423773: Change the default local translation file layout for v0.3. The namespace marked as default in the TMS now maps to root locale files such as `en.json`, while other namespaces map to `{namespace}/{languageTag}.json` such as `admin/en.json`.

  `comvi pull`, `comvi push`, and CLI type generation now resolve the default namespace from the backend instead of treating `.comvirc.json` as the source of truth. Custom `fileTemplate` values remain literal; set `"fileTemplate": "{languageTag}/{namespace}.json"` to keep the v0.2 layout.

## 0.2.0

### Minor Changes

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

### Patch Changes

- cba88bf: Fix broken documentation URLs in published READMEs. The `@comvi/cli` README pointed at `/docs/i18n/tooling/cli/` (404) — corrected to `/docs/cli/`. The `@comvi/vite-plugin` README's documentation links pointed at `/docs/i18n/tooling/vite-plugin/`, which doesn't exist at any URL — links removed until docs ship.

## 0.1.1

### Patch Changes

- 8c559e9: Republish all packages from CI via npm Trusted Publishing so every tarball ships with a signed provenance attestation linking it back to the comvi-io/comvi-js release.yml workflow run that built it.

## 0.1.0

### Minor Changes

- 947baf9: Initial public release of Comvi i18n.

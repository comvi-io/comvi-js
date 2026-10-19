<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">typegen (internal)</h1>

<p align="center">The one copy of the <code>TranslationKeys</code> declaration format. A private workspace package — it is never published.</p>

---

> **Workspace-private.** `"private": true` in `package.json`, and in the `ignore`
> list of `.changeset/config.json`. There is no npm package and nothing to
> install. This directory exists so the CLI and the Vite plugin emit byte-identical
> declarations without keeping two copies of the emitter.

## Who uses it, and how

| Consumer             | Mechanism                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@comvi/cli`         | **Inlined at build time.** Absent from the rolldown `external` list; the declarations are bundled by `vite-plugin-dts` |
| `@comvi/vite-plugin` | **Inlined at build time**, the same way                                                                                |

Both builds pass `bundledPackages: ["@comvi/typegen"]` to `vite-plugin-dts`, so
the rolled-up `dist/index.d.ts` carries `SchemaParam`, `KeySchema` and
`ProjectSchema` as its own declarations instead of importing them from a package
nobody can install. That is the gate: nothing published may name this package.

## What consumers use instead

`comvi typegen` (the CLI command) generates from the Comvi TMS schema;
`comviTypes()` from `@comvi/vite-plugin` generates from local JSON files;
`TypeEmitter` from `@comvi/cli` is the published programmatic emitter. The
schema types are re-exported under the same names from both `@comvi/cli` and
`@comvi/vite-plugin`.

## What it guarantees

- **One format, two tools.** The CLI and the Vite plugin emit byte-identical
  declarations, so switching between them never rewrites the file.
- **Nothing but strings.** No dependencies and no `node:` imports — a caller
  reads the schema and writes the file; this package only formats.
- **Stable output.** No timestamp is stamped, so regenerating an unchanged
  schema produces the same bytes and leaves the working tree clean.

## The three functions

- **`emitDeclarations(schema, options?)`** — the whole declaration file as a
  string. Keys are emitted in code-unit order, and every key and param name goes
  through `JSON.stringify`, so an apostrophe or a hyphen in either is safe.
  A `"string"` param is emitted as `string | number`, because the runtime renders
  a number in a bare `{name}` and matches it in a `select`; a `"number"` param
  stays `number`. Options: `strictParams` (default `true`; `false` makes every param optional),
  `defaultNs` (default `"default"`; keys in that namespace lose their prefix)
  and `augment` (default `"@comvi/core"`; the module the declarations augment,
  which must be a plain module specifier). The header is fixed and names no
  tool: line 3 is the same `DO NOT EDIT` notice whichever tool wrote the file,
  and no timestamp is stamped, so it is not a caller option.
  It throws for a schema it cannot express: a param whose `type` is neither
  `"string"` nor `"number"`, two keys that collide once `defaultNs` is
  stripped (`default:title` and `title`), and an `augment` holding a quote,
  backslash, whitespace or anything else outside a module specifier.
- **`countKeyLines(content)`** — how many declaration lines a generated file
  already carries. Both quote styles count, so a file left by an older generator
  is measured correctly. Used for the "current N keys, expected M" check line.
- **`normalizeGenerated(content)`** — drops what a regeneration is allowed to
  change (the `Generated at:` line `@comvi/cli` 0.4 stamped, and header line 3
  in every wording that has shipped) and trims, so two normalized strings
  decide whether a file is up to date.

## The schema

```ts
interface SchemaParam {
  name: string;
  type: "string" | "number";
}
interface KeySchema {
  params: SchemaParam[];
}
interface ProjectSchema {
  keys: Record<string, KeySchema>;
}
```

Keys are flat and namespaced with a colon, as in `"common:greeting"`. Param
order is declaration order and is preserved in the emitted type.

`pnpm --filter @comvi/typegen test` pins the output format; the cli's
`tests/typegen-contract.test.ts` and the vite plugin's `tests/emit.test.ts` pin
the two seams over it.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi

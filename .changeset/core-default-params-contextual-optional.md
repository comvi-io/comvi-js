---
"@comvi/core": patch
---

`I18nOptions` no longer demands `defaultParams` from a host that was written down by type.

Naming a host's type instantiates `D` with its own constraint, whose `keyof` is `string`, so the
`string extends keyof D` arm of `I18nOptions<D>` decided — and that arm required the option. Every
annotated position therefore failed to compile without a `defaultParams` nobody meant to configure:

```ts
// error TS2322: Property 'defaultParams' is missing in type '{ locale: string; }'
const i18n: ReturnType<typeof createI18n> = createI18n({ locale: "en" });
const options: ConstructorParameters<typeof I18n>[0] = { locale: "en" };
```

That arm exists to keep an index-signature `D` out of the type's `never` branch —
`OptionalKeys<Record<string, V>>` is `string`, not `never` — and not to demand the option: an index
signature promises no particular key, so there is nothing for the instance to guarantee. It is now
`defaultParams?: D`, and the annotated forms above compile.

Unchanged: a `D` whose keys are statically known and all required still has to supply them
(`createI18n<{ formality: "formal" | "informal" }>({ locale: "en" })` is still an error), a `D` with
optional keys is still rejected outright, and inference from a passed `defaultParams` is untouched.

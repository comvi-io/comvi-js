import { createI18n, I18n, type DefaultTranslationParams } from "@comvi/core";

// `TranslationKeys` is augmented once for the whole program in
// tests/types/translation-keys.test-d.ts.

type ConfiguredDefaults = { formality: "formal" | "informal" };

const configured = createI18n<ConfiguredDefaults>({
  locale: "en",
  defaultParams: { formality: "formal" },
});

configured.t("review");
configured.t("review", { formality: "informal" });
configured.t("greeting", { name: "Eugene" });

const inferred = createI18n({
  locale: "en",
  defaultParams: { formality: "formal" },
});
inferred.t("review");
inferred.setDefaultParams({ formality: "informal" });
// @ts-expect-error generated schemas keep runtime replacements type-compatible
inferred.setDefaultParams({ formality: "other" });
// @ts-expect-error generated schemas reject a different primitive type
inferred.setDefaultParams({ formality: 123 });

const untypedDefaultKey = createI18n({
  locale: "en",
  defaultParams: { audience: "public" },
});
untypedDefaultKey.setDefaultParams({ audience: "private" });

type SerializedDefaults = Record<string, string | number | boolean> & {
  locale?: never;
  ns?: never;
  fallback?: never;
  raw?: never;
};
declare const serializedDefaults: SerializedDefaults;
createI18n({ locale: "en", defaultParams: serializedDefaults });

const annotatedDefaults: DefaultTranslationParams = { formality: "formal" };
const annotated = createI18n({ locale: "en", defaultParams: annotatedDefaults });
// @ts-expect-error a broad annotated map cannot guarantee a generated parameter's value type
annotated.t("review");
annotated.t("review", { formality: "formal" });

// Namespace selection remains a per-call control even when interpolation defaults exist.
configured.t("title", { ns: "admin" });
// @ts-expect-error namespaced keys still require explicit namespace selection
configured.t("title");

const plain = createI18n({ locale: "en" });
// @ts-expect-error an instance without constructor defaults still requires formality
plain.t("review");
plain.t("review", { formality: "formal" });

plain.setDefaultParams({ formality: "formal" });
// @ts-expect-error a runtime setter does not strengthen the instance's static type
plain.t("review");
plain.setDefaultParams(undefined);

const incompatible = createI18n({
  locale: "en",
  defaultParams: { count: "one" },
});
// @ts-expect-error a string default cannot satisfy a numeric generated parameter
incompatible.t("count");
incompatible.t("count", { count: 1 });

// @ts-expect-error nullish values are not meaningful instance defaults
createI18n({ locale: "en", defaultParams: { formality: null } });
// @ts-expect-error nullish values are not meaningful instance defaults
createI18n({ locale: "en", defaultParams: { formality: undefined } });

type OptionalDefaults = { formality?: "formal" | "informal" };
// @ts-expect-error optional defaults cannot represent constructor guarantees
createI18n<OptionalDefaults>({ locale: "en", defaultParams: {} });

// @ts-expect-error constructor-guaranteed defaults cannot be cleared
configured.setDefaultParams(undefined);
// @ts-expect-error constructor-guaranteed keys cannot be removed
configured.setDefaultParams({});
configured.setDefaultParams({ formality: "informal" });
// @ts-expect-error guaranteed defaults keep their declared replacement value type
configured.setDefaultParams({ formality: 123 });
// @ts-expect-error null cannot replace a constructor-guaranteed interpolation value
configured.setDefaultParams({ formality: null });
// @ts-expect-error undefined cannot replace a constructor-guaranteed interpolation value
configured.setDefaultParams({ formality: undefined });

// Every CONTEXTUAL position instantiates `D` with its own constraint, whose
// `keyof` is `string` — so the `string extends keyof D` arm of `I18nOptions`
// decides there, and it must keep `defaultParams` OPTIONAL. An index signature
// guarantees no key, so there is nothing for the option to promise; requiring it
// only broke every annotated host.
const contextualHost: ReturnType<typeof createI18n> = createI18n({ locale: "en" });
contextualHost.t("greeting", { formality: "formal", name: "Eugene" });

const contextualOptions: ConstructorParameters<typeof I18n>[0] = { locale: "en" };
new I18n(contextualOptions).t("greeting", { formality: "formal", name: "Eugene" });

// …while a `D` whose keys ARE statically known still owes its guarantees.
// @ts-expect-error constructor-guaranteed defaults cannot be omitted
createI18n<ConfiguredDefaults>({ locale: "en" });

// @ts-expect-error routing controls are not interpolation defaults
createI18n({ locale: "en", defaultParams: { locale: "de" } });
// @ts-expect-error namespace controls are not interpolation defaults
createI18n({ locale: "en", defaultParams: { ns: "admin" } });
// @ts-expect-error fallback controls are not interpolation defaults
createI18n({ locale: "en", defaultParams: { fallback: "Missing" } });
// @ts-expect-error post-processing controls are not interpolation defaults
createI18n({ locale: "en", defaultParams: { raw: true } });

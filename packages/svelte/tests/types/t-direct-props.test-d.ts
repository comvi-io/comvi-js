/**
 * An interpolation param may be written as a direct prop
 * (`<T i18nKey="cart" count={2} />`), so `<T>`'s props type has to accept a
 * key it never declared — the widening `@comvi/react`'s `TProps` already has.
 *
 * The probes are object-literal ANNOTATIONS on purpose: excess-property
 * checking is what proves the extra key is legal, and a generic-constraint
 * probe would pass with or without the widening.
 */
import type { TProps } from "../../src/types";

// A sibling `.test-d.ts` closes `TranslationKeys` for this whole program, so
// the probes use the keys it registers.
export const _directParam: TProps = { i18nKey: "review", count: 2 };

export const _directParamBesideParams: TProps = {
  i18nKey: "greeting",
  params: { when: "today" },
  name: "Ada",
};

// The declared props keep their own types.
export const _declaredProps: TProps = {
  i18nKey: "greeting",
  ns: "dashboard",
  locale: "fr",
  fallback: "Hello",
  skipPostProcess: true,
  components: { bold: "strong" },
};

// `raw` is a deprecated alias for `skipPostProcess`, still type-valid.
export const _deprecatedRaw: TProps = {
  i18nKey: "greeting",
  raw: true,
};

// `allowedTags` is a 0.4 prop with no 0.5 equivalent: `<T>` renders
// structurally, so there is no HTML-string sink left to allowlist tags for.
// `TBaseProps.allowedTags?: never` makes it a tombstone rather than a widened
// interpolation param — this must NOT compile.
export const _tombstonedAllowedTags: TProps = {
  i18nKey: "greeting",
  // @ts-expect-error Removed in 0.5: `<T>` renders structurally; allowedTags is gone.
  allowedTags: ["b"],
};

// The widening for genuine interpolation params must survive the tombstone:
// an unrelated undeclared key still compiles (mirrors `_directParam` above).
export const _directParamStillWidens: TProps = {
  i18nKey: "greeting",
  count: 1,
};

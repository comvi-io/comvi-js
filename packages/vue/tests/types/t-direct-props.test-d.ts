/**
 * An interpolation param may be written as a direct attribute
 * (`<T i18nKey="cart" :count="2" />`), so `<T>`'s props type has to accept a
 * key it never declared — the widening `@comvi/react`'s `TProps` already has.
 *
 * The probes are object-literal ANNOTATIONS on purpose: excess-property
 * checking is what proves the extra key is legal, and a generic-constraint
 * probe would pass with or without the widening.
 */
import { T } from "../../src/index";

type TProps = InstanceType<typeof T>["$props"];

export const _directParam: TProps = { i18nKey: "cart.items", count: 2 };

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

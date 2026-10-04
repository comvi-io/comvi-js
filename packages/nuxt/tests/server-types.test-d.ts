import { describe, it, expectTypeOf } from "vitest";
import type {
  ServerI18n,
  UseTranslationOptions,
  UseTranslationResult,
} from "../src/runtime/server/utils/useTranslation";

/**
 * The server helper's vocabulary, at the type level. `ns` is the one name;
 * `namespace` does not compile. See `docs/design/next-nuxt-parity.md`.
 */
describe("useTranslation options", () => {
  it("takes `ns`, the canonical name", () => {
    expectTypeOf<UseTranslationOptions>().toExtend<{ ns?: string }>();
    expectTypeOf({ ns: "admin" }).toExtend<UseTranslationOptions>();
  });

  it("rejects `namespace`, a name 0.5 does not have", () => {
    // @ts-expect-error -- the option is `ns`.
    const options: UseTranslationOptions = { namespace: "admin" };
    void options;
  });

  it("takes neither", () => {
    expectTypeOf({}).toExtend<UseTranslationOptions>();
  });

  it("rejects a namespace that is not a string", () => {
    // @ts-expect-error `ns` is a namespace name, not a list
    expectTypeOf<{ ns: string[] }>().toExtend<UseTranslationOptions>();
  });
});

/**
 * The shape shared with `@comvi/next`'s `getI18n()`. The companion assertion is
 * `packages/next/tests/types/server-result-shape.test-d.ts`, which spells the
 * same three members against `ServerI18n`; neither package can drop one
 * quietly. The three members are written out here rather than imported — next
 * is not a dependency of nuxt, and the point is that two independent packages
 * agree.
 */
interface SharedServerHelperShape {
  t: unknown;
  hasTranslation: unknown;
  locale: string;
}

describe("useTranslation result", () => {
  it("carries the resolved locale as a plain string", () => {
    expectTypeOf<UseTranslationResult["locale"]>().toEqualTypeOf<string>();
  });

  it("has exactly the three members next's getI18n() has", () => {
    expectTypeOf<keyof UseTranslationResult>().toEqualTypeOf<"t" | "locale" | "hasTranslation">();
  });

  it("satisfies the shared server-helper shape", () => {
    expectTypeOf<UseTranslationResult>().toExtend<SharedServerHelperShape>();
  });
});

describe("the shared server helper type names", () => {
  it("ServerI18n is the same type as UseTranslationResult", () => {
    expectTypeOf<ServerI18n>().toEqualTypeOf<UseTranslationResult>();
  });
});

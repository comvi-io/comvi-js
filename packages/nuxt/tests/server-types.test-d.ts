import { describe, it, expectTypeOf } from "vitest";
import type {
  UseTranslationOptions,
  UseTranslationResult,
} from "../src/runtime/server/utils/useTranslation";

/**
 * The server helper's vocabulary, at the type level. `ns` is canonical and
 * `namespace` is the deprecated 0.4 alias — both must still compile through
 * 0.5, which is the whole point of keeping the alias. See
 * `docs/design/next-nuxt-parity.md`.
 */
describe("useTranslation options", () => {
  it("takes `ns`, the canonical name", () => {
    expectTypeOf<UseTranslationOptions>().toExtend<{ ns?: string }>();
    expectTypeOf({ ns: "admin" }).toExtend<UseTranslationOptions>();
  });

  it("still takes the deprecated `namespace` alias", () => {
    expectTypeOf<UseTranslationOptions>().toExtend<{ namespace?: string }>();
    expectTypeOf({ namespace: "admin" }).toExtend<UseTranslationOptions>();
  });

  it("takes both together, which is what the runtime warning is for", () => {
    expectTypeOf({ ns: "admin", namespace: "legacy" }).toExtend<UseTranslationOptions>();
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

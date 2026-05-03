import { describe, it, expectTypeOf } from "vitest";
import type { InferKeys } from "../../src/types";

describe("InferKeys", () => {
  it("should flatten a flat object with namespace prefix", () => {
    type Result = InferKeys<{ greeting: string; logout: string }, "common">;

    expectTypeOf<Result>().toEqualTypeOf<{
      "common:greeting": never;
      "common:logout": never;
    }>();
  });

  it("should flatten nested objects to dot-notation", () => {
    type Result = InferKeys<{ button: { ok: string; cancel: string } }, "common">;

    expectTypeOf<Result>().toEqualTypeOf<{
      "common:button.ok": never;
      "common:button.cancel": never;
    }>();
  });

  it("should handle deeply nested objects", () => {
    type Result = InferKeys<{ a: { b: { c: string } } }, "ns">;

    expectTypeOf<Result>().toEqualTypeOf<{
      "ns:a.b.c": never;
    }>();
  });

  it("should handle mixed flat and nested keys", () => {
    type Result = InferKeys<{ title: string; nested: { key: string } }, "page">;

    expectTypeOf<Result>().toEqualTypeOf<{
      "page:title": never;
      "page:nested.key": never;
    }>();
  });

  it("should work with multiple InferKeys merged via extends", () => {
    type Combined = InferKeys<{ greeting: string }, "common"> &
      InferKeys<{ title: string }, "dashboard">;

    expectTypeOf<Combined>().toEqualTypeOf<{
      "common:greeting": never;
      "dashboard:title": never;
    }>();
  });

  it("should generate keys without prefix when namespace is omitted", () => {
    type Result = InferKeys<{
      common: { greeting: string };
      home: { title: string };
    }>;

    expectTypeOf<Result>().toEqualTypeOf<{
      "common.greeting": never;
      "home.title": never;
    }>();
  });

  it("should work with default ns (no prefix) and named ns combined", () => {
    type Combined = InferKeys<{ greeting: string }> & InferKeys<{ dashboard: string }, "admin">;

    expectTypeOf<Combined>().toEqualTypeOf<{
      greeting: never;
      "admin:dashboard": never;
    }>();
  });

  it("should strip prefix when NS matches DefaultNS", () => {
    type Result = InferKeys<{ greeting: string; logout: string }, "common", "common">;

    expectTypeOf<Result>().toEqualTypeOf<{
      greeting: never;
      logout: never;
    }>();
  });

  it("should add prefix when NS differs from DefaultNS", () => {
    type Result = InferKeys<{ dashboard: string }, "admin", "common">;

    expectTypeOf<Result>().toEqualTypeOf<{
      "admin:dashboard": never;
    }>();
  });

  it("should handle 5 levels of nesting", () => {
    type Result = InferKeys<{ a: { b: { c: { d: { e: string } } } } }, "ns">;

    expectTypeOf<Result>().toEqualTypeOf<{
      "ns:a.b.c.d.e": never;
    }>();
  });

  it("should work with DefaultNS across multiple namespaces", () => {
    type DefaultNS = "common";
    type Combined = InferKeys<{ greeting: string }, "common", DefaultNS> &
      InferKeys<{ dashboard: string }, "admin", DefaultNS> &
      InferKeys<{ not_found: string }, "errors", DefaultNS>;

    expectTypeOf<Combined>().toEqualTypeOf<{
      greeting: never;
      "admin:dashboard": never;
      "errors:not_found": never;
    }>();
  });
});

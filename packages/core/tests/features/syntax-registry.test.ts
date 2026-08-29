import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearTemplateCache } from "../../src/core/translate";
import { icuCompiler } from "../../src/core/translate/compile-icu";
import {
  _resetSyntaxExtensions,
  effectiveExtBits,
  effectiveExtensions,
  getAmbientExtensions,
  getCompilerId,
  mergeTagInterpolation,
  registerSyntaxExtension,
  type MessageCompiler,
  type SyntaxExtension,
} from "../../src/core/translate/syntax";
import { TK_TEXT } from "../../src/core/translate/cache";

// A wrong compiler id or a stale extension union makes two parses share one cache entry.

function inertExtension(id: string, cacheBit: number): SyntaxExtension {
  return {
    id,
    cacheBit,
    parseHook: () => undefined,
    processHook: () => undefined,
  };
}

const inertCompiler = (): MessageCompiler => ({ makeArgToken: (c) => [TK_TEXT, c] });

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

afterEach(() => {
  _resetSyntaxExtensions();
});

describe("getCompilerId()", () => {
  it("hands each injected compiler an id that collides with no other compiler", () => {
    const [first, second, third] = [inertCompiler(), inertCompiler(), inertCompiler()];

    const ids = [getCompilerId(first), getCompilerId(second), getCompilerId(third)];

    expect(ids[1]).toBeGreaterThan(ids[0]);
    expect(ids[2]).toBeGreaterThan(ids[1]);
    expect(ids.filter((id) => id <= getCompilerId(icuCompiler))).toEqual([]);
  });
});

describe("registerSyntaxExtension()", () => {
  it("keeps every extension with a distinct id", () => {
    registerSyntaxExtension(inertExtension("first", 4));
    registerSyntaxExtension(inertExtension("second", 8));

    expect(getAmbientExtensions().map((ext) => ext.id)).toEqual(["first", "second"]);
    expect(effectiveExtBits()).toBe(12);
  });

  it("warns when a second extension claims a cacheBit already in use", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerSyntaxExtension(inertExtension("first", 4));

    registerSyntaxExtension(inertExtension("second", 4));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"first" and "second" share cacheBit 4'),
    );
  });

  it("stays silent when the cacheBits differ", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerSyntaxExtension(inertExtension("first", 4));

    registerSyntaxExtension(inertExtension("second", 8));

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("publishes a new snapshot per registration instead of mutating the last one", () => {
    registerSyntaxExtension(inertExtension("first", 4));
    const snapshot = getAmbientExtensions();

    registerSyntaxExtension(inertExtension("second", 8));

    expect(snapshot).toHaveLength(1);
    expect(getAmbientExtensions()).toHaveLength(2);
  });
});

describe("the disposer returned by registerSyntaxExtension()", () => {
  it("removes only its own registration", () => {
    registerSyntaxExtension(inertExtension("first", 4));
    const disposeSecond = registerSyntaxExtension(inertExtension("second", 8));

    disposeSecond();

    expect(getAmbientExtensions().map((ext) => ext.id)).toEqual(["first"]);
    expect(effectiveExtBits()).toBe(4);
  });

  it("does not remove a later re-registration of the same extension", () => {
    const ext = inertExtension("first", 4);
    const dispose = registerSyntaxExtension(ext);
    dispose();
    registerSyntaxExtension(ext);

    dispose();

    expect(getAmbientExtensions()).toHaveLength(1);
  });

  it("is a no-op once _resetSyntaxExtensions() has already cleared the registry", () => {
    const dispose = registerSyntaxExtension(inertExtension("first", 4));
    _resetSyntaxExtensions();

    expect(() => dispose()).not.toThrow();
    expect(getAmbientExtensions()).toEqual([]);
  });
});

describe("effectiveExtensions() / effectiveExtBits()", () => {
  it.each([
    ["no argument", undefined],
    ["an empty array", [] as SyntaxExtension[]],
  ])("returns the ambient snapshot itself for %s", (_label, perCall) => {
    registerSyntaxExtension(inertExtension("ambient", 4));

    expect(effectiveExtensions(perCall)).toBe(getAmbientExtensions());
  });

  it("reports the ambient bits for an empty per-call array", () => {
    registerSyntaxExtension(inertExtension("ambient", 4));

    expect(effectiveExtBits([])).toBe(4);
  });

  it("unions a per-call extension after the ambient ones", () => {
    registerSyntaxExtension(inertExtension("ambient", 4));
    const perCall = [inertExtension("perCall", 8)];

    expect(effectiveExtensions(perCall).map((ext) => ext.id)).toEqual(["ambient", "perCall"]);
    expect(effectiveExtBits(perCall)).toBe(12);
  });

  it("ignores a per-call extension whose id is already registered ambiently", () => {
    const ext = inertExtension("shared", 4);
    registerSyntaxExtension(ext);

    expect(effectiveExtensions([ext])).toHaveLength(1);
    expect(effectiveExtBits([ext])).toBe(4);
  });

  it("returns the identical union array for a repeated stable per-call array", () => {
    registerSyntaxExtension(inertExtension("ambient", 4));
    const perCall = [inertExtension("perCall", 8)];

    expect(effectiveExtensions(perCall)).toBe(effectiveExtensions(perCall));
  });

  it("recomputes the union of a stable per-call array after the ambient set changes", () => {
    const dispose = registerSyntaxExtension(inertExtension("ambient", 4));
    const perCall = [inertExtension("perCall", 8)];
    expect(effectiveExtBits(perCall)).toBe(12);

    dispose();

    expect(effectiveExtBits(perCall)).toBe(8);
    expect(effectiveExtensions(perCall).map((ext) => ext.id)).toEqual(["perCall"]);
  });
});

describe("mergeTagInterpolation()", () => {
  const baseExt = inertExtension("base", 4);
  const perCallExt = inertExtension("perCall", 8);

  it("returns the instance options unchanged when there are no per-call options", () => {
    const base = { strict: true as const };

    expect(mergeTagInterpolation(base, undefined)).toBe(base);
  });

  it("returns the per-call options unchanged when there are no instance options", () => {
    const perCall = { strict: true as const };

    expect(mergeTagInterpolation(undefined, perCall)).toBe(perCall);
  });

  it("lets a per-call field override the instance field and keeps the others", () => {
    const merged = mergeTagInterpolation(
      { strict: true, basicHtmlTags: ["b"] },
      { strict: "warn" },
    );

    expect(merged).toEqual({ strict: "warn", basicHtmlTags: ["b"] });
  });

  it("unions extensions instance-first rather than letting the per-call side replace them", () => {
    const merged = mergeTagInterpolation({ extensions: [baseExt] }, { extensions: [perCallExt] });

    expect(merged?.extensions).toEqual([baseExt, perCallExt]);
  });

  it("keeps the instance extensions when the per-call side declares none", () => {
    const merged = mergeTagInterpolation({ extensions: [baseExt] }, { strict: true });

    expect(merged?.extensions).toEqual([baseExt]);
  });

  it("keeps the per-call extensions when the instance declares none", () => {
    const merged = mergeTagInterpolation({ strict: true }, { extensions: [perCallExt] });

    expect(merged?.extensions).toEqual([perCallExt]);
  });
});

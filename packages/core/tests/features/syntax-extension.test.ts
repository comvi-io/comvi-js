import { describe, it, expect, beforeEach, afterEach } from "vitest";
// NOTE: internals imported directly (not "../../src") so ambient tag
// registration stays under this file's control.
import { I18n } from "../../src/core/i18n";
import { clearTemplateCache, _templateCacheSize } from "../../src/core/translate";
import { icuCompiler } from "../../src/core/translate/compile-icu";
import { registerTagSyntax, tagSyntaxExtension } from "../../src/core/translate/tags";
import {
  _resetSyntaxExtensions,
  getAmbientExtensions,
  effectiveExtBits,
} from "../../src/core/translate/syntax";
import type { TagInterpolationOptions } from "../../src/types";

const TEMPLATE = "<link>hi</link>";
const linkHandler = ({ children }: { children: unknown }) => `[${children}]`;

function makeInstance(tagInterpolation?: TagInterpolationOptions) {
  const i18n = new I18n({ locale: "en", exposeGlobal: false, tagInterpolation }, icuCompiler);
  i18n.addTranslations({ en: { msg: TEMPLATE } });
  return i18n;
}

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

afterEach(() => {
  _resetSyntaxExtensions();
});

describe("syntax extension registry", () => {
  it("renders unregistered <link>hi</link> literally (no tag engine in the effective set)", () => {
    const i18n = makeInstance();
    expect(i18n.t("msg" as never, { link: linkHandler } as never)).toBe(TEMPLATE);
  });

  it("registration is idempotent by id", () => {
    registerTagSyntax();
    registerTagSyntax();
    expect(getAmbientExtensions().length).toBe(1);
    expect(effectiveExtBits()).toBe(tagSyntaxExtension.cacheBit);
  });

  it("disposer removes the ambient registration and later parses are un-poisoned", () => {
    const dispose = registerTagSyntax();
    const i18n = makeInstance();
    expect(i18n.t("msg" as never, { link: linkHandler } as never)).toBe("[hi]");

    dispose();

    expect(getAmbientExtensions().length).toBe(0);
    expect(i18n.t("msg" as never, { link: linkHandler } as never)).toBe(TEMPLATE);
  });

  it("the disposer is itself idempotent", () => {
    const dispose = registerTagSyntax();

    dispose();
    dispose();

    expect(getAmbientExtensions().length).toBe(0);
  });

  it("tags on/off occupy distinct cache entries for the same template (no cross-poisoning)", () => {
    const dispose = registerTagSyntax();
    const withTags = makeInstance();
    expect(withTags.t("msg" as never, { link: linkHandler } as never)).toBe("[hi]");
    const sizeAfterTags = _templateCacheSize();

    dispose();
    const withoutTags = makeInstance();
    expect(withoutTags.t("msg" as never, { link: linkHandler } as never)).toBe(TEMPLATE);
    // The size delta is part of the claim: a SECOND entry must appear, rather
    // than the tags-on entry being overwritten in place.
    expect(_templateCacheSize()).toBe(sizeAfterTags + 1);

    // Re-registering must not clear or corrupt either variant.
    registerTagSyntax();
    expect(withTags.t("msg" as never, { link: linkHandler } as never)).toBe("[hi]");
  });

  it("per-call extension renders tags with NO ambient registration, then a plain call stays literal", () => {
    // The per-call channel is ordering-proof.
    const perCall = makeInstance({ extensions: [tagSyntaxExtension] });
    expect(perCall.t("msg" as never, { link: linkHandler } as never)).toBe("[hi]");
    const sizeAfterPerCall = _templateCacheSize();

    // The same template WITHOUT the per-call extension (ambient still empty):
    // distinct cache entry, un-poisoned literal output.
    const plain = makeInstance();
    expect(plain.t("msg" as never, { link: linkHandler } as never)).toBe(TEMPLATE);
    // As above: a distinct variant, not an overwrite of the per-call entry.
    expect(_templateCacheSize()).toBe(sizeAfterPerCall + 1);

    // And the per-call instance keeps rendering through its own variant.
    expect(perCall.t("msg" as never, { link: linkHandler } as never)).toBe("[hi]");
  });

  it("effective set is ambient ∪ per-call (per-call passing is a no-op when ambient already has it)", () => {
    registerTagSyntax();
    const perCall = makeInstance({ extensions: [tagSyntaxExtension] });
    expect(perCall.t("msg" as never, { link: linkHandler } as never)).toBe("[hi]");
    expect(effectiveExtBits([tagSyntaxExtension])).toBe(effectiveExtBits());
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { clearTemplateCache, translate, translateTemplate } from "../../src/core/translate";
import { simpleCompiler } from "../../src/core/translate/compile-simple";
import { _resetSyntaxExtensions } from "../../src/core/translate/syntax";

// Two default argument values no in-repo caller exercises: hosts pass both explicitly.

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

describe("translate() defaults", () => {
  it("renders an absent parameter as its literal placeholder", () => {
    const result = translate("Hi {name}!", "en", {}, undefined, simpleCompiler);

    expect(result).toBe("Hi {name}!");
  });
});

describe("translateTemplate() defaults", () => {
  it("renders an absent parameter as its literal placeholder", () => {
    const result = translateTemplate("Hi {name}!", {}, "en", undefined, simpleCompiler);

    expect(result).toBe("Hi {name}!");
  });
});

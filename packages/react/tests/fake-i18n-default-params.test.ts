import { describe, expect, it } from "vitest";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";

describe("FakeI18n defaultParams contract", () => {
  it.each(["locale", "ns", "fallback", "raw"])(
    "rejects the reserved call-control key %s",
    (key) => {
      expect(
        () =>
          new FakeI18n({
            defaultParams: { [key]: "invalid" },
          } as never),
      ).toThrow(/defaultParams.*locale.*ns.*fallback.*raw/i);
    },
  );

  it.each([null, undefined])("rejects a nullish default value (%s)", (value) => {
    expect(
      () =>
        new FakeI18n({
          defaultParams: { formality: value },
        } as never),
    ).toThrow(/defaultParams.*null.*undefined/i);
  });

  it("validates runtime replacements before changing state", () => {
    const fake = new FakeI18n();

    expect(() => fake.setDefaultParams({ locale: "de" })).toThrow(
      /defaultParams.*locale.*ns.*fallback.*raw/i,
    );
    expect(() => fake.setDefaultParams({ formality: null } as never)).toThrow(
      /defaultParams.*null.*undefined/i,
    );
    expect(fake.defaultParams).toBeUndefined();
  });

  it("preserves constructor-guaranteed defaults during runtime replacements", () => {
    const fake = new FakeI18n({
      defaultParams: { formality: "formal" },
    } as never);

    expect(fake.defaultParams).toEqual({ formality: "formal" });
    expect(() => fake.setDefaultParams(undefined)).toThrow(/formality/);
    expect(() => fake.setDefaultParams({})).toThrow(/formality/);
    expect(fake.defaultParams).toEqual({ formality: "formal" });
  });

  it("accepts a valid replacement and exposes it on defaultParams", () => {
    const fake = new FakeI18n({ defaultParams: { formality: "formal" } } as never);

    fake.setDefaultParams({ formality: "informal" });

    expect(fake.defaultParams).toEqual({ formality: "informal" });
  });
});

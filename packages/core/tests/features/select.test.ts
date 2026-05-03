import { describe, it, expect, beforeEach } from "vitest";
import { I18n } from "../../src";

describe("Select Format Features", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n({ locale: "en" });
  });

  it("should select based on exact string match", () => {
    i18n.addTranslations({
      en: {
        gender: "{gender, select, male {He} female {She} other {They}} went to the store.",
      },
    });

    expect(i18n.t("gender", { gender: "male" })).toBe("He went to the store.");
    expect(i18n.t("gender", { gender: "female" })).toBe("She went to the store.");
    expect(i18n.t("gender", { gender: "nonbinary" })).toBe("They went to the store.");
  });

  it("should support 'other' as fallback", () => {
    i18n.addTranslations({
      en: {
        status: "Status: {val, select, active {Green} other {Gray}}",
      },
    });
    expect(i18n.t("status", { val: "unknown" })).toBe("Status: Gray");
  });

  it("should support nested select statements", () => {
    i18n.addTranslations({
      en: {
        profile:
          "{gender, select, male {His status is {status, select, online {Online} other {Offline}}} other {Their status is unknown}}",
      },
    });

    expect(i18n.t("profile", { gender: "male", status: "online" })).toBe("His status is Online");
    expect(i18n.t("profile", { gender: "male", status: "away" })).toBe("His status is Offline");
  });

  it("should support plural inside select", () => {
    i18n.addTranslations({
      en: {
        party:
          "{host, select, me {I have {guestCount, plural, one {one guest} other {# guests}}} other {{host} has {guestCount, plural, one {one guest} other {# guests}}}}",
      },
    });

    expect(i18n.t("party", { host: "me", guestCount: 1 })).toBe("I have one guest");
    expect(i18n.t("party", { host: "me", guestCount: 3 })).toBe("I have 3 guests");
    expect(i18n.t("party", { host: "Alice", guestCount: 5 })).toBe("Alice has 5 guests");
  });

  it("should handle prototype-like select values safely", () => {
    i18n.addTranslations({
      en: {
        fallback: "{val, select, active {Green} other {Gray}}",
        proto: "{val, select, __proto__ {Proto} other {Other}}",
      },
    });

    expect(i18n.t("fallback", { val: "toString" })).toBe("Gray");
    expect(i18n.t("fallback", { val: "constructor" })).toBe("Gray");
    expect(i18n.t("proto", { val: "__proto__" })).toBe("Proto");
  });
});

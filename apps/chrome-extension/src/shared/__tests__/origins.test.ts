/**
 * Origin canonicalization is the extension's trust boundary: every stored
 * credential and every session is keyed by the value these two functions
 * return, so anything they accept is something a page can claim to be.
 */
import { describe, it, expect } from "vitest";
import { canonicalizeOrigin, canonicalizePageOrigin } from "../origins";

/** A syntactically valid https origin of exactly `length` characters. */
function originOfLength(length: number): string {
  const prefix = "https://";
  return prefix + "a".repeat(length - prefix.length);
}

describe("canonicalizeOrigin", () => {
  it.each([
    ["https://app.example.com", "https://app.example.com"],
    ["https://app.example.com/", "https://app.example.com"],
    ["https://app.example.com:8443", "https://app.example.com:8443"],
    ["http://localhost:5173", "http://localhost:5173"],
    ["http://127.0.0.1:3000", "http://127.0.0.1:3000"],
    ["http://[::1]:3000", "http://[::1]:3000"],
  ])("canonicalizes %s", (raw, expected) => {
    expect(canonicalizeOrigin(raw)).toBe(expected);
  });

  it("accepts an origin of exactly the 2048-character limit", () => {
    const raw = originOfLength(2048);
    expect(raw).toHaveLength(2048);
    expect(canonicalizeOrigin(raw)).toBe(raw);
  });

  it("rejects an otherwise valid origin one character past the limit", () => {
    expect(canonicalizeOrigin(originOfLength(2049))).toBeNull();
  });

  it("rejects a non-string even when it stringifies to a valid origin", () => {
    expect(canonicalizeOrigin(new URL("https://app.example.com"))).toBeNull();
  });

  it.each([
    ["an empty string", ""],
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["a bare hostname", "app.example.com"],
    ["a garbage string", "not a url"],
  ])("rejects %s", (_label, raw) => {
    expect(canonicalizeOrigin(raw)).toBeNull();
  });

  it.each([
    ["credentials", "https://user:secret@evil.example"],
    ["a username without a password", "https://user@evil.example"],
    ["a path", "https://app.example.com/admin"],
    ["a query string", "https://app.example.com/?next=1"],
    ["a fragment", "https://app.example.com/#top"],
  ])("rejects an origin carrying %s", (_label, raw) => {
    expect(canonicalizeOrigin(raw)).toBeNull();
  });

  it.each([
    ["http on a non-loopback host", "http://app.example.com"],
    ["a hostname that merely starts with localhost", "http://localhost.evil.example"],
    ["a hostname that merely ends with 127.0.0.1", "http://evil.example.127.0.0.1.nip.io"],
  ])("rejects %s", (_label, raw) => {
    expect(canonicalizeOrigin(raw)).toBeNull();
  });

  it.each([
    ["ftp://localhost"],
    ["ws://localhost"],
    ["chrome-extension://abcdefghijklmnop"],
    ["javascript:alert(1)"],
    ["data:text/html,hi"],
  ])("rejects the non-http(s) scheme in %s even on a loopback host", (raw) => {
    expect(canonicalizeOrigin(raw)).toBeNull();
  });
});

describe("canonicalizePageOrigin", () => {
  it("reduces a full page URL to its origin", () => {
    expect(canonicalizePageOrigin("https://app.example.com/checkout?step=2#top")).toBe(
      "https://app.example.com",
    );
  });

  it("keeps the loopback exception for dev servers", () => {
    expect(canonicalizePageOrigin("http://localhost:5173/en/pricing")).toBe(
      "http://localhost:5173",
    );
  });

  it("returns null instead of throwing for an unparseable URL", () => {
    expect(canonicalizePageOrigin("chrome://extensions")).toBeNull();
    expect(canonicalizePageOrigin("about:blank")).toBeNull();
    expect(canonicalizePageOrigin("not a url")).toBeNull();
  });

  it("rejects a non-string even when it stringifies to a valid page URL", () => {
    expect(canonicalizePageOrigin(new URL("https://app.example.com/page"))).toBeNull();
  });

  it.each([
    ["an empty string", ""],
    ["undefined", undefined],
    ["a number", 42],
  ])("rejects %s", (_label, pageUrl) => {
    expect(canonicalizePageOrigin(pageUrl)).toBeNull();
  });

  it("still applies the scheme policy to the extracted origin", () => {
    expect(canonicalizePageOrigin("http://app.example.com/page")).toBeNull();
  });
});

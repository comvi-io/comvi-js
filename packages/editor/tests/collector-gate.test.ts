import { describe, it, expect } from "vitest";
import { computeVisibleSetSignature, VisibleSetGate } from "../src/collector/gate";

describe("collector/gate", () => {
  it("computeVisibleSetSignature is stable regardless of input order", () => {
    const a = computeVisibleSetSignature(
      [
        { namespace: "ns", key: "b" },
        { namespace: "ns", key: "a" },
      ],
      "/home",
    );
    const b = computeVisibleSetSignature(
      [
        { namespace: "ns", key: "a" },
        { namespace: "ns", key: "b" },
      ],
      "/home",
    );

    expect(a).toBe(b);
  });

  it("differs when the screenGroup changes even with the same keys", () => {
    const targets = [{ namespace: "ns", key: "a" }];
    const home = computeVisibleSetSignature(targets, "/home");
    const settings = computeVisibleSetSignature(targets, "/settings");

    expect(home).not.toBe(settings);
  });

  it("differs when only a target's per-target screenGroup changes (modal opens over the same keys)", () => {
    const plain = computeVisibleSetSignature(
      [
        { namespace: "ns", key: "a", screenGroup: "/home" },
        { namespace: "ns", key: "b", screenGroup: "/home" },
      ],
      "",
    );
    const withModal = computeVisibleSetSignature(
      [
        { namespace: "ns", key: "a", screenGroup: "/home" },
        { namespace: "ns", key: "b", screenGroup: "/home#modal:x" },
      ],
      "",
    );

    expect(plain).not.toBe(withModal);
  });

  it("differs when a key is added or removed", () => {
    const base = computeVisibleSetSignature([{ namespace: "ns", key: "a" }], "/home");
    const withExtra = computeVisibleSetSignature(
      [
        { namespace: "ns", key: "a" },
        { namespace: "ns", key: "b" },
      ],
      "/home",
    );

    expect(base).not.toBe(withExtra);
  });

  it("computeVisibleSetSignature joins the screenGroup, namespace and key with '::'", () => {
    expect(computeVisibleSetSignature([{ namespace: "ns", key: "a" }], "/home")).toBe(
      "/home::ns::a",
    );
  });

  it("computeVisibleSetSignature appends a per-target screenGroup as a third '::' field", () => {
    const signature = computeVisibleSetSignature(
      [
        { namespace: "ns", key: "b" },
        { namespace: "ns", key: "a", screenGroup: "/home#modal:x" },
      ],
      "",
    );

    expect(signature).toBe("::ns::a::/home#modal:x::ns::b");
  });

  it("computeVisibleSetSignature emits the bare screenGroup plus a separator for no targets", () => {
    expect(computeVisibleSetSignature([], "/home")).toBe("/home::");
  });

  it("distinguishes a namespace/key boundary shift (ns 'a' + key 'bc' vs ns 'ab' + key 'c')", () => {
    const first = computeVisibleSetSignature([{ namespace: "a", key: "bc" }], "/home");
    const second = computeVisibleSetSignature([{ namespace: "ab", key: "c" }], "/home");

    expect(first).not.toBe(second);
  });

  it("computeVisibleSetSignature returns a screenGroup-specific signature for an empty target list", () => {
    const emptyHome = computeVisibleSetSignature([], "/home");
    const emptySettings = computeVisibleSetSignature([], "/settings");

    expect(emptyHome).toBe(computeVisibleSetSignature([], "/home"));
    expect(emptyHome).not.toBe(emptySettings);
    expect(emptyHome).not.toBe(
      computeVisibleSetSignature([{ namespace: "ns", key: "a" }], "/home"),
    );
  });

  describe("VisibleSetGate", () => {
    it("reports a change on the first call", () => {
      const gate = new VisibleSetGate();

      expect(gate.hasChanged("sig-1")).toBe(true);
    });

    it("reports no change when the signature repeats (P3 — zero passes for an unchanged set)", () => {
      const gate = new VisibleSetGate();
      expect(gate.hasChanged("sig-1")).toBe(true);
      expect(gate.hasChanged("sig-1")).toBe(false);
      expect(gate.hasChanged("sig-1")).toBe(false);
    });

    it("reports a change again once the signature differs", () => {
      const gate = new VisibleSetGate();
      gate.hasChanged("sig-1");

      expect(gate.hasChanged("sig-2")).toBe(true);
    });

    it("reset() forgets the last signature", () => {
      const gate = new VisibleSetGate();
      gate.hasChanged("sig-1");

      gate.reset();

      expect(gate.hasChanged("sig-1")).toBe(true);
    });
  });
});

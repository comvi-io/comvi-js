/**
 * The standalone editor against the `devtools()` editor-loader slot
 * (`contracts/chrome-extension-proxy.json`, "editorLoader").
 *
 * The pairing is permanent in both directions: `@latest` puts a new editor on
 * a page whose core is old, and an `editorVersion` pin or the browser cache
 * puts an old editor on a page whose core is new. So the editor runs against
 * EVERY frozen slot literal in `fixtures/editor-loader-hooks/`, against no
 * slot at all (an extension that bundles the editor injected it) and against a
 * protocol newer than itself.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import pkg from "../package.json";
import type { EditorLoaderSlot } from "@comvi/core";

const LOADER_KEY = Symbol.for("comvi.devtools.editorLoader");
const LOAD_KEY = Symbol.for("comvi.devtools.editorLoad");

const fixtures = import.meta.glob<{ default: EditorLoaderSlot }>(
  "./fixtures/editor-loader-hooks/*.js",
  { eager: true },
);
const protocol1 = fixtures["./fixtures/editor-loader-hooks/protocol-1.js"].default;

type Standalone = typeof import("../src/standalone");
type Slots = Record<symbol, unknown>;

let standalone: Standalone | undefined;

/**
 * Loads the standalone bundle's module the way a `<script>` does: once, onto a
 * page that already has its i18n instance and the given slot. The workspace
 * core installs its own slot when the instance composes devtools, so `slot`
 * replaces it afterwards; `undefined` removes it — the page of an extension
 * that bundles the editor, on a core older than the loader.
 */
async function bootEditorOnPage(slot: unknown): Promise<Standalone> {
  vi.resetModules();
  const { createI18n } = await import("./helpers/composedInstance");
  createI18n({
    locale: "en",
    defaultNs: "default",
    messages: { "en:default": { hello: "Hello" } },
  });
  if (slot === undefined) {
    delete (globalThis as unknown as Slots)[LOADER_KEY];
  } else {
    (globalThis as unknown as Slots)[LOADER_KEY] = slot;
  }
  standalone = await import("../src/standalone");
  return standalone;
}

afterEach(() => {
  if (standalone?.isActive()) {
    standalone.deactivate();
  }
  standalone = undefined;
  delete (globalThis as unknown as Slots)[LOADER_KEY];
  delete (globalThis as unknown as Slots)[LOAD_KEY];
  delete (window as { __COMVI__?: unknown }).__COMVI__;
  delete (window as { ComviInContextEditor?: unknown }).ComviInContextEditor;
  document.body.innerHTML = "";
});

describe("standalone editor ↔ editor-loader slot", () => {
  it("fixtures directory → holds at least the protocol-1 literal", () => {
    expect(Object.keys(fixtures)).toContain("./fixtures/editor-loader-hooks/protocol-1.js");
  });

  it.each(Object.entries(fixtures))(
    "page with the frozen slot %s → the editor activates and getStatus().hook echoes its protocol and sdkVersion",
    async (_file, fixture) => {
      const slot = fixture.default;

      const editor = await bootEditorOnPage(slot);
      const result = editor.activate({ refreshMessages: false });

      expect(result).not.toBeNull();
      expect(editor.getStatus().hook).toEqual({
        protocol: slot.protocol,
        sdkVersion: slot.sdkVersion,
      });
    },
  );

  it("page with no slot (an extension that bundles the editor injected it) → the editor activates and reports hook: null", async () => {
    const editor = await bootEditorOnPage(undefined);
    const result = editor.activate({ refreshMessages: false });

    expect(result).not.toBeNull();
    expect(editor.getStatus().hook).toBeNull();
  });

  it("slot of a newer protocol with fields this editor does not know → the editor activates and reports that protocol", async () => {
    const newerSlot = { ...protocol1, protocol: 2, futureField: { nested: true } };

    const editor = await bootEditorOnPage(newerSlot);
    const result = editor.activate({ refreshMessages: false });

    expect(result).not.toBeNull();
    expect(editor.getStatus().hook).toEqual({ protocol: 2, sdkVersion: protocol1.sdkVersion });
  });

  it("slot installed by the workspace's own @comvi/core → hook echoes the live slot's protocol and sdkVersion", async () => {
    vi.resetModules();
    const { createI18n } = await import("./helpers/composedInstance");
    createI18n({ locale: "en", messages: {} });
    const liveSlot = (globalThis as unknown as Slots)[LOADER_KEY] as {
      protocol: number;
      sdkVersion: string;
    };

    standalone = await import("../src/standalone");

    expect(liveSlot.protocol).toBeGreaterThanOrEqual(1);
    expect(standalone.getStatus().hook).toEqual({
      protocol: liveSlot.protocol,
      sdkVersion: liveSlot.sdkVersion,
    });
  });

  it("slot read at boot → only `protocol` and `sdkVersion` are read, and load() is never called", async () => {
    const read = new Set<PropertyKey>();
    const load = vi.fn(protocol1.load);
    const recordingSlot = new Proxy(
      { ...protocol1, load },
      {
        get(target, key, receiver) {
          read.add(key);
          return Reflect.get(target, key, receiver);
        },
      },
    );

    const editor = await bootEditorOnPage(recordingSlot);
    editor.activate({ refreshMessages: false });

    expect([...read].sort()).toEqual(["protocol", "sdkVersion"]);
    expect(load).not.toHaveBeenCalled();
  });

  it("slot whose sdkVersion is not a string → hook keeps the protocol and carries no sdkVersion key", async () => {
    const editor = await bootEditorOnPage({
      ...protocol1,
      sdkVersion: { toString: () => "9.9.9" },
    });

    expect(editor.getStatus().hook).toStrictEqual({ protocol: 1 });
  });

  it("slot whose sdkVersion is longer than 64 characters → hook carries its first 64", async () => {
    const editor = await bootEditorOnPage({ ...protocol1, sdkVersion: `0.5.1-${"x".repeat(500)}` });

    expect(editor.getStatus().hook).toStrictEqual({
      protocol: 1,
      sdkVersion: `0.5.1-${"x".repeat(58)}`,
    });
  });

  it("getStatus() called twice → each call hands out its own hook object, so a caller cannot edit the next answer", async () => {
    const editor = await bootEditorOnPage(protocol1);
    const first = editor.getStatus().hook;

    first!.protocol = 99;
    delete first!.sdkVersion;

    expect(editor.getStatus().hook).not.toBe(first);
    expect(editor.getStatus().hook).toStrictEqual({ protocol: 1, sdkVersion: "0.5.1" });
  });

  it.each([
    ["protocol 0", { ...protocol1, protocol: 0 }],
    ["a fractional protocol", { ...protocol1, protocol: 1.5 }],
    ["a string protocol", { ...protocol1, protocol: "1" }],
    ["no protocol", { sdkVersion: "0.5.1" }],
    ["null in the slot", null],
    ["a string in the slot", "protocol-1"],
  ])("page with %s → hook: null, and the editor still activates", async (_label, slot) => {
    const editor = await bootEditorOnPage(slot);
    const result = editor.activate({ refreshMessages: false });

    expect(editor.getStatus().hook).toBeNull();
    expect(result).not.toBeNull();
  });

  it("slot whose protocol getter throws → the editor boots, reports hook: null and activates", async () => {
    const hostileSlot = Object.defineProperty({ ...protocol1 }, "protocol", {
      get() {
        throw new Error("hostile slot");
      },
    });

    const editor = await bootEditorOnPage(hostileSlot);
    const result = editor.activate({ refreshMessages: false });

    expect(editor.getStatus().hook).toBeNull();
    expect(result).not.toBeNull();
  });
});

describe("window.ComviInContextEditor.version", () => {
  it("booted editor → exposes its own package version, the one the editor loader reports", async () => {
    const editor = await bootEditorOnPage(undefined);

    expect(window.ComviInContextEditor?.version).toBe(pkg.version);
    expect(editor.version).toBe(pkg.version);
  });
});

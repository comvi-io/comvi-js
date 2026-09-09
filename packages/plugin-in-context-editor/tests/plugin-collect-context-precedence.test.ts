/**
 * Precedence guard for the documented `collectContext` contract: the
 * `createI18n` option is the single developer-level opt-out and wins on BOTH
 * activation paths. `standalone.ts` (the extension path) has always honoured
 * it; the composed plugin path once read only its own option and silently
 * re-enabled collection for an app that had opted out.
 *
 * These cases drive the real Core and the real Collector, and watch the one
 * observable thing a started collector does: the transport handshake. The
 * host carries an API key on purpose — without one the editor runs in demo
 * mode, where the collector never starts regardless of the option.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asPluginHost, createI18n, type ComposedHost } from "./helpers/composedHost";
import { CollectorTransport } from "../src/collector/transport";
import { InContextEditorPlugin } from "../src/index";

let handshakeSpy: ReturnType<typeof vi.spyOn>;

function makeHost(collectContext?: boolean): ComposedHost {
  return createI18n({
    locale: "en",
    defaultNs: "default",
    apiKey: "test-api-key",
    translation: { "en:default": { hello: "Hello" } },
    ...(collectContext === undefined ? {} : { collectContext }),
  });
}

/** Installs the plugin and lets `Collector.start()`'s microtasks settle. */
async function install(host: ComposedHost, options?: { collectContext?: boolean }) {
  const cleanup = InContextEditorPlugin(options)(asPluginHost(host)) as () => void;
  await Promise.resolve();
  await Promise.resolve();
  return cleanup;
}

describe("composed plugin path: host collectContext beats the plugin option", () => {
  beforeEach(() => {
    handshakeSpy = vi
      .spyOn(CollectorTransport.prototype, "handshake")
      .mockResolvedValue(true) as ReturnType<typeof vi.spyOn>;
    // Teardown flushes a final pass over the network; keep it inert.
    vi.spyOn(CollectorTransport.prototype, "flushOnTeardown").mockImplementation(() => {});
  });

  afterEach(() => {
    delete (window as { __COMVI__?: unknown }).__COMVI__;
  });

  it("does not start the collector when the host opted out and the plugin option is unset", async () => {
    const cleanup = await install(makeHost(false));

    expect(handshakeSpy).not.toHaveBeenCalled();

    cleanup?.();
  });

  it("does not start the collector when the host opted out and the plugin asks for true", async () => {
    const cleanup = await install(makeHost(false), { collectContext: true });

    expect(handshakeSpy).not.toHaveBeenCalled();

    cleanup?.();
  });

  it("does not start the collector when only the plugin opts out", async () => {
    const cleanup = await install(makeHost(), { collectContext: false });

    expect(handshakeSpy).not.toHaveBeenCalled();

    cleanup?.();
  });

  it("starts the collector when neither the host nor the plugin opts out", async () => {
    const cleanup = await install(makeHost());

    expect(handshakeSpy).toHaveBeenCalledTimes(1);

    cleanup?.();
  });
});

/**
 * Cross-repository contract checks for the proxy route table.
 *
 * These reach outside the extension package (the js-sdk root `contracts/`
 * document and the SDK's canonical telemetry fixture) and therefore only run
 * in a full checkout. They live apart from the proxy.*.test.ts suites so that the
 * behavioural suite stays loadable from an isolated copy of this package —
 * a mutation-testing sandbox, for one, where an unresolvable import would
 * silently drop every proxy test.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PROXY_ROUTE_CONTRACT } from "../proxy";
import { EDITOR_VERSION, HANDLE_KIND, HANDLE_PROTOCOL, QUEUE_GLOBAL } from "../protocol";
import proxyContract from "../../../../../contracts/chrome-extension-proxy.json";
import wireFixture from "../__fixtures__/wire-observation.fixture.json";

describe("machine-readable proxy contract", () => {
  it("matches the route table enforced by the sanitizer", () => {
    const declared = proxyContract.routes.map(({ source: _source, ...route }) => route);
    expect(PROXY_ROUTE_CONTRACT).toEqual(declared);
  });
});

describe("machine-readable discovery contract", () => {
  const { discovery, handle } = proxyContract;

  it("names the global the detector reads", () => {
    expect(discovery.global).toBe(QUEUE_GLOBAL);
    expect(discovery.entry.shape).toBe("{ v: string, i: I18n, x: ComviHandle }");
  });

  it("names the handle protocol and kind the detector drives", () => {
    expect(handle.protocol).toBe(HANDLE_PROTOCOL);
    expect(handle.shape).toContain(`p: ${HANDLE_PROTOCOL}, kind: '${HANDLE_KIND}'`);
    expect(handle.shape).toContain("load(version?)");
  });

  it("states the editor file the detector's exact version is loaded as", () => {
    const editor = JSON.parse(
      readFileSync(new URL("../../../../../packages/editor/package.json", import.meta.url), "utf8"),
    );
    expect(editor.name).toBe("@comvi/editor");
    expect(editor.version).toBe(EDITOR_VERSION);
    expect(handle["load(version?)"]).toContain(`${editor.name}@<version>/dist/standalone.iife.js`);
    expect(handle["load(version?)"]).toContain("the exact version it passes");
  });

  // Owner decision D1 (lot 8): protocol 2 only, the 0.7 consumers' hook is not part of it.
  it("pairs the extension with core 0.8 and protocol 2 only", () => {
    const pairing = discovery.versionPairing as Record<string, string>;
    expect(Object.keys(pairing).sort()).toEqual([
      "core-0.5-to-0.7+extension-for-0.8",
      "core-0.8+extension-0.6.x",
      "core-0.8+extension-for-0.8",
      "two-cores-0.8-same-page",
      "unknown-handle+extension-for-0.8",
    ]);
    expect(pairing["core-0.8+extension-for-0.8"]).toContain("x.p === 2");
    expect(pairing["core-0.5-to-0.7+extension-for-0.8"]).toMatch(/^UNSUPPORTED .*old-protocol/);
    expect(pairing["unknown-handle+extension-for-0.8"]).toMatch(/^UNSUPPORTED.*unknown-protocol/);
    expect(discovery.pageToExtension).not.toHaveProperty("consumer07");
  });
});

describe("SDK telemetry wire fixture", () => {
  it("matches the SDK-generated canonical fixture", () => {
    const sdkFixtureUrl = new URL(
      "../../../../../packages/editor/src/collector/hash/wire-observation.fixture.json",
      import.meta.url,
    );
    expect(JSON.parse(readFileSync(sdkFixtureUrl, "utf8"))).toEqual(wireFixture);
  });
});

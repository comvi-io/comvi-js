/**
 * Cross-repository contract checks for the proxy route table.
 *
 * These reach outside the extension package (the js-sdk root `contracts/`
 * document and the SDK's canonical telemetry fixture) and therefore only run
 * in a full checkout. They live apart from proxy.test.ts so that the
 * behavioural suite stays loadable from an isolated copy of this package —
 * a mutation-testing sandbox, for one, where an unresolvable import would
 * silently drop every proxy test.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PROXY_ROUTE_CONTRACT } from "../proxy";
import proxyContract from "../../../../../contracts/chrome-extension-proxy.json";
import wireFixture from "../__fixtures__/wire-observation.fixture.json";

describe("machine-readable proxy contract", () => {
  it("matches the route table enforced by the sanitizer", () => {
    const declared = proxyContract.routes.map(({ source: _source, ...route }) => route);
    expect(PROXY_ROUTE_CONTRACT).toEqual(declared);
  });
});

describe("machine-readable discovery contract", () => {
  const { pageToExtension } = proxyContract.discovery;

  /**
   * The adoption marker and the members a consumer must validate before
   * trusting it are cross-package literals: both shipped consumers (this
   * package's MAIN-world detector and `@comvi/plugin-in-context-editor`'s
   * `ensureComviHook`) key adoption on them, and core's own probe requires
   * `push` AND `remove` before pushing. The behavioural half is pinned in
   * `src/content/__tests__/detector-hook.test.ts`.
   */
  it("names the marker both consumers key adoption on", () => {
    expect(pageToExtension.marker).toBe("__comviEditorHook");
    expect(pageToExtension.hookShape).toContain("__comviEditorHook: true");
  });

  it("names the members a consumer must validate before adopting a marked global", () => {
    expect(pageToExtension.requiredMembers).toEqual(["push", "remove", "instances"]);
  });

  it("states that the marker alone is not proof of a hook", () => {
    expect(pageToExtension.markerRule).toContain("requiredMembers");
    expect(pageToExtension.markerRule).toContain("Array.isArray");
  });
});

describe("SDK telemetry wire fixture", () => {
  it("matches the SDK-generated canonical fixture", () => {
    const sdkFixtureUrl = new URL(
      "../../../../../packages/plugin-in-context-editor/src/collector/hash/wire-observation.fixture.json",
      import.meta.url,
    );
    expect(JSON.parse(readFileSync(sdkFixtureUrl, "utf8"))).toEqual(wireFixture);
  });
});

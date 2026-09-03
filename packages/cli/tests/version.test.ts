import { afterEach, describe, expect, it, vi } from "vitest";

describe("CLI_VERSION fallback", () => {
  afterEach(() => {
    vi.doUnmock("node:fs");
    vi.resetModules();
  });

  async function versionWithPackageJson(readFileSync: () => string): Promise<string> {
    vi.resetModules();
    vi.doMock("node:fs", () => ({ readFileSync }));
    const { CLI_VERSION } = await import("../src/utils/version");
    return CLI_VERSION;
  }

  it("falls back to 0.0.0 when no package.json candidate can be read", async () => {
    await expect(
      versionWithPackageJson(() => {
        throw new Error("unreadable");
      }),
    ).resolves.toBe("0.0.0");
  });

  it("falls back to 0.0.0 when no candidate belongs to @comvi/cli", async () => {
    await expect(
      versionWithPackageJson(() => JSON.stringify({ name: "someone-else", version: "9.9.9" })),
    ).resolves.toBe("0.0.0");
  });
});

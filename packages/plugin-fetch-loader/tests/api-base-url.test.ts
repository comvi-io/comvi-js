import { describe, it, expect, vi, afterEach } from "vitest";

// `API_BASE_URL` is read once, at module evaluation, so each case re-imports the
// module after stubbing the environment.
const loadApiBaseUrl = async () => {
  vi.resetModules();
  return (await import("../src/options")).API_BASE_URL;
};

describe("API_BASE_URL", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("is the Comvi platform preset when no override is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_COMVI_API_URL", "");
    expect(await loadApiBaseUrl()).toBe("https://api.comvi.io");
  });

  it("takes NEXT_PUBLIC_COMVI_API_URL, the Next.js override", async () => {
    vi.stubEnv("NEXT_PUBLIC_COMVI_API_URL", "https://api.self-hosted.example");
    expect(await loadApiBaseUrl()).toBe("https://api.self-hosted.example");
  });

  it("is the preset where `process` does not exist (a browser, an edge runtime)", async () => {
    vi.stubGlobal("process", undefined);
    expect(await loadApiBaseUrl()).toBe("https://api.comvi.io");
  });

  it("is the preset where `process` has no `env`", async () => {
    vi.stubGlobal("process", {});
    expect(await loadApiBaseUrl()).toBe("https://api.comvi.io");
  });

  it("ignores VITE_API_BASE_URL: the published dist cannot read a consumer's Vite env", async () => {
    vi.stubEnv("NEXT_PUBLIC_COMVI_API_URL", "");
    vi.stubEnv("VITE_API_BASE_URL", "https://api.vite.example");
    expect(await loadApiBaseUrl()).toBe("https://api.comvi.io");
  });
});

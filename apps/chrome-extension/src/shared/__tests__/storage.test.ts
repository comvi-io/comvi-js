/**
 * Credential storage holds the only copy of a user's API keys, so its schema
 * gate (unknown versions are cleared fail-closed) and its per-origin scoping
 * are exercised here against a minimal chrome.storage.local fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CURRENT_STORAGE_SCHEMA_VERSION,
  STORAGE_SCHEMA_KEY,
  clearCredentialFamily,
  clearCredentials,
  ensureStorageSchema,
  getAllCredentials,
  getCredentials,
  getOriginFromUrl,
  setCredentials,
  type OriginCredentials,
} from "../storage";

const CREDENTIALS_KEY = "comvi_credentials";

let local: Map<string, unknown>;

/** Everything chrome.storage.local exposes that shared/storage.ts uses. */
function installStorageFake() {
  local = new Map<string, unknown>();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const wanted = Array.isArray(keys) ? keys : [keys];
          const result: Record<string, unknown> = {};
          for (const key of wanted) if (local.has(key)) result[key] = local.get(key);
          return result;
        },
        set: async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) local.set(key, value);
        },
      },
    },
  });
}

function seed(schemaVersion: unknown, credentials: Record<string, OriginCredentials>) {
  local.set(STORAGE_SCHEMA_KEY, schemaVersion);
  local.set(CREDENTIALS_KEY, credentials);
}

function storedCredentials(): Record<string, OriginCredentials> {
  return local.get(CREDENTIALS_KEY) as Record<string, OriginCredentials>;
}

beforeEach(() => {
  installStorageFake();
});

describe("getCredentials", () => {
  it("returns the entry stored for that exact origin", async () => {
    seed(CURRENT_STORAGE_SCHEMA_VERSION, {
      "https://a.example": { apiKey: "key-a", validated: true },
      "https://b.example": { apiKey: "key-b" },
    });
    await expect(getCredentials("https://a.example")).resolves.toEqual({
      apiKey: "key-a",
      validated: true,
    });
  });

  it("returns null for an origin that has no entry", async () => {
    seed(CURRENT_STORAGE_SCHEMA_VERSION, { "https://a.example": { apiKey: "key-a" } });
    await expect(getCredentials("https://b.example")).resolves.toBeNull();
  });

  it("returns null when the credential record is missing entirely", async () => {
    local.set(STORAGE_SCHEMA_KEY, CURRENT_STORAGE_SCHEMA_VERSION);
    await expect(getCredentials("https://a.example")).resolves.toBeNull();
  });

  it("refuses to read credentials written under an unknown schema version", async () => {
    seed(99, { "https://a.example": { apiKey: "key-a" } });
    await expect(getCredentials("https://a.example")).resolves.toBeNull();
  });

  it("refuses to read credentials with no schema version at all", async () => {
    local.set(CREDENTIALS_KEY, { "https://a.example": { apiKey: "key-a" } });
    await expect(getCredentials("https://a.example")).resolves.toBeNull();
  });
});

describe("getAllCredentials", () => {
  it("returns every stored origin", async () => {
    const all = { "https://a.example": { apiKey: "key-a" }, "https://b.example": { apiKey: "b" } };
    seed(CURRENT_STORAGE_SCHEMA_VERSION, all);
    await expect(getAllCredentials()).resolves.toEqual(all);
  });

  it("returns an empty map when the credential record is missing", async () => {
    local.set(STORAGE_SCHEMA_KEY, CURRENT_STORAGE_SCHEMA_VERSION);
    await expect(getAllCredentials()).resolves.toEqual({});
  });

  it("returns an empty map under an unknown schema version", async () => {
    seed(99, { "https://a.example": { apiKey: "key-a" } });
    await expect(getAllCredentials()).resolves.toEqual({});
  });
});

describe("setCredentials", () => {
  it("stores an entry under its origin and stamps the current schema version", async () => {
    await setCredentials("https://a.example", { apiKey: "key-a", validated: true });
    expect(storedCredentials()).toEqual({
      "https://a.example": { apiKey: "key-a", validated: true },
    });
    expect(local.get(STORAGE_SCHEMA_KEY)).toBe(CURRENT_STORAGE_SCHEMA_VERSION);
  });

  it("keeps entries for other origins", async () => {
    seed(CURRENT_STORAGE_SCHEMA_VERSION, { "https://a.example": { apiKey: "key-a" } });
    await setCredentials("https://b.example", { apiKey: "key-b" });
    expect(storedCredentials()).toEqual({
      "https://a.example": { apiKey: "key-a" },
      "https://b.example": { apiKey: "key-b" },
    });
  });

  it("discards credentials carried over from an unknown schema version", async () => {
    seed(99, { "https://legacy.example": { apiKey: "legacy-key" } });
    await setCredentials("https://a.example", { apiKey: "key-a" });
    expect(storedCredentials()).toEqual({ "https://a.example": { apiKey: "key-a" } });
  });

  it("serializes concurrent writes so no entry is lost", async () => {
    await Promise.all([
      setCredentials("https://a.example", { apiKey: "key-a" }),
      setCredentials("https://b.example", { apiKey: "key-b" }),
      setCredentials("https://c.example", { apiKey: "key-c" }),
    ]);
    expect(Object.keys(storedCredentials()).sort()).toEqual([
      "https://a.example",
      "https://b.example",
      "https://c.example",
    ]);
  });
});

describe("clearCredentials", () => {
  it("removes only the named origin", async () => {
    seed(CURRENT_STORAGE_SCHEMA_VERSION, {
      "https://a.example": { apiKey: "key-a" },
      "https://b.example": { apiKey: "key-b" },
    });
    await clearCredentials("https://a.example");
    expect(storedCredentials()).toEqual({ "https://b.example": { apiKey: "key-b" } });
  });

  it("is a no-op for an origin that was never stored", async () => {
    seed(CURRENT_STORAGE_SCHEMA_VERSION, { "https://b.example": { apiKey: "key-b" } });
    await clearCredentials("https://a.example");
    expect(storedCredentials()).toEqual({ "https://b.example": { apiKey: "key-b" } });
  });
});

describe("clearCredentialFamily", () => {
  it("returns the removed key and drops every origin sharing it", async () => {
    seed(CURRENT_STORAGE_SCHEMA_VERSION, {
      "https://a.example": { apiKey: "shared-key" },
      "https://staging.example": { apiKey: "shared-key", validated: true },
      "https://other.example": { apiKey: "other-key" },
    });
    await expect(clearCredentialFamily("https://a.example")).resolves.toBe("shared-key");
    expect(storedCredentials()).toEqual({ "https://other.example": { apiKey: "other-key" } });
  });

  it("leaves origins holding a different key untouched", async () => {
    seed(CURRENT_STORAGE_SCHEMA_VERSION, {
      "https://a.example": { apiKey: "key-a" },
      "https://b.example": { apiKey: "key-b" },
    });
    await clearCredentialFamily("https://a.example");
    expect(storedCredentials()).toEqual({ "https://b.example": { apiKey: "key-b" } });
  });

  it("returns undefined and removes nothing for an unknown origin", async () => {
    seed(CURRENT_STORAGE_SCHEMA_VERSION, { "https://b.example": { apiKey: "key-b" } });
    await expect(clearCredentialFamily("https://a.example")).resolves.toBeUndefined();
    expect(storedCredentials()).toEqual({ "https://b.example": { apiKey: "key-b" } });
  });
});

describe("ensureStorageSchema", () => {
  it("reports no migration when the stored version is already current", async () => {
    seed(CURRENT_STORAGE_SCHEMA_VERSION, { "https://a.example": { apiKey: "key-a" } });
    await expect(ensureStorageSchema()).resolves.toBe(false);
    expect(storedCredentials()).toEqual({ "https://a.example": { apiKey: "key-a" } });
  });

  it("reports a migration and clears credentials on first install", async () => {
    await expect(ensureStorageSchema()).resolves.toBe(true);
    expect(storedCredentials()).toEqual({});
    expect(local.get(STORAGE_SCHEMA_KEY)).toBe(CURRENT_STORAGE_SCHEMA_VERSION);
  });

  it("clears credentials written under an unknown schema version", async () => {
    seed(99, { "https://legacy.example": { apiKey: "legacy-key" } });
    await expect(ensureStorageSchema()).resolves.toBe(true);
    expect(storedCredentials()).toEqual({});
  });

  it("preserves unrelated local preferences while migrating", async () => {
    local.set("comvi_theme", "dark");
    await ensureStorageSchema();
    expect(local.get("comvi_theme")).toBe("dark");
  });
});

describe("getOriginFromUrl", () => {
  it.each([
    ["https://app.example.com/checkout?step=2#top", "https://app.example.com"],
    ["http://localhost:5173/en", "http://localhost:5173"],
  ])("reduces %s to its origin", (url, expected) => {
    expect(getOriginFromUrl(url)).toBe(expected);
  });

  it("returns an empty string instead of throwing on an unparseable URL", () => {
    expect(getOriginFromUrl("not a url")).toBe("");
  });
});

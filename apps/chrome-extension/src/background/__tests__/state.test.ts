/**
 * Per-key mutation queue and the chrome.storage.session record accessors.
 *
 * The queue is what stops two interleaved MV3 event handlers from losing an
 * update on a session record, so its serialization and its release behaviour
 * are asserted through observable ordering rather than through the lock map.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { installFakeChrome, type Harness } from "./harness";
import {
  bumpAuthorityEpoch,
  bumpNavGen,
  getAllSessions,
  getAuthorityEpoch,
  getNavGen,
  putSession,
  putTabState,
  tabLockKey,
  withLock,
  type SessionRecord,
} from "../state";

const TAB = 7;

let harness: Harness;
let keyCounter = 0;
/** A key no other test has queued on: `locks` is module state shared by the file. */
const freshKey = () => `mutation-key-${(keyCounter += 1)}`;

beforeEach(() => {
  harness = installFakeChrome();
});

/** Let every already-scheduled microtask and timer callback run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A lock body that blocks until the returned `release` is called. */
function blockingOperation(log: string[], name: string) {
  let release!: () => void;
  const operation = () =>
    new Promise<void>((resolve) => {
      log.push(`${name}:start`);
      release = () => {
        log.push(`${name}:end`);
        resolve();
      };
    });
  return { operation, release: () => release() };
}

function sessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    status: "pending",
    origin: "https://app.example.com",
    apiKey: "cmv_test_key",
    collectContext: false,
    nonce: "nonce-1",
    popupLeaseId: "popup-lease-test-0001",
    navGen: 0,
    expiresAt: 0,
    ...overrides,
  };
}

describe("per-key mutation queue", () => {
  it("runs mutations of the same key one after another", async () => {
    const log: string[] = [];
    const key = freshKey();
    const first = blockingOperation(log, "first");
    const running = withLock(key, first.operation);
    const queued = withLock(key, async () => {
      log.push("second:start");
    });

    await settle();

    expect(log).toEqual(["first:start"]);
    first.release();
    await Promise.all([running, queued]);
    expect(log).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("lets mutations of different keys run concurrently", async () => {
    const log: string[] = [];
    const blocked = blockingOperation(log, "blocked");
    const running = withLock("key-a", blocked.operation);

    await withLock("key-b", async () => {
      log.push("other:done");
    });

    expect(log).toEqual(["blocked:start", "other:done"]);
    blocked.release();
    await running;
  });

  it("gives every tab its own lock", async () => {
    const log: string[] = [];
    const blocked = blockingOperation(log, "tab-7");
    const running = withLock(tabLockKey(7), blocked.operation);

    await withLock(tabLockKey(8), async () => {
      log.push("tab-8:done");
    });

    expect(log).toEqual(["tab-7:start", "tab-8:done"]);
    blocked.release();
    await running;
  });

  it("keeps a later mutation queued behind work that is still running", async () => {
    const log: string[] = [];
    const key = freshKey();
    const first = blockingOperation(log, "first");
    const second = blockingOperation(log, "second");
    const firstRun = withLock(key, first.operation);
    const secondRun = withLock(key, second.operation);
    await settle();
    first.release();
    await firstRun;

    const thirdRun = withLock(key, async () => {
      log.push("third:start");
    });
    await settle();

    expect(log).not.toContain("third:start");
    second.release();
    await Promise.all([secondRun, thirdRun]);
    expect(log).toEqual(["first:start", "first:end", "second:start", "second:end", "third:start"]);
  });

  it("does not let a failed mutation block the next one", async () => {
    const key = freshKey();
    const failing = withLock(key, async () => {
      throw new Error("mutation failed");
    });

    await expect(failing).rejects.toThrow("mutation failed");
    await expect(withLock(key, async () => "recovered")).resolves.toBe("recovered");
  });
});

describe("session enumeration", () => {
  it("returns only the records that name a tab", async () => {
    await putSession(TAB, sessionRecord());
    await putTabState(TAB, { comviDetected: true });
    await bumpNavGen(TAB);
    await harness.chrome.storage.session.set({ comvi_session_extra: sessionRecord() });

    const sessions = await getAllSessions();

    expect([...sessions.keys()]).toEqual([TAB]);
  });

  it("returns the stored record for each tab", async () => {
    const record = sessionRecord({ status: "active" });
    await putSession(TAB, record);

    const sessions = await getAllSessions();

    expect(sessions.get(TAB)).toEqual(record);
  });
});

describe("navigation generation", () => {
  it("reports zero for a tab that has never navigated", async () => {
    await expect(getNavGen(TAB)).resolves.toBe(0);
  });

  it("advances the generation on every navigation", async () => {
    const before = await getNavGen(TAB);

    const bumped = await bumpNavGen(TAB);

    expect(bumped).toBeGreaterThan(before);
    await expect(getNavGen(TAB)).resolves.toBe(bumped);
  });

  it("treats a non-numeric stored generation as zero", async () => {
    await harness.chrome.storage.session.set({ [`comvi_navgen_${TAB}`]: "corrupted" });

    await expect(getNavGen(TAB)).resolves.toBe(0);
  });
});

describe("authority epoch", () => {
  it("reports zero before any credential purge", async () => {
    await expect(getAuthorityEpoch()).resolves.toBe(0);
  });

  it("advances the epoch on every purge", async () => {
    const before = await getAuthorityEpoch();

    const bumped = await bumpAuthorityEpoch();

    expect(bumped).toBeGreaterThan(before);
    await expect(getAuthorityEpoch()).resolves.toBe(bumped);
  });

  it("treats a non-numeric stored epoch as zero", async () => {
    await harness.chrome.storage.session.set({ comvi_authority_epoch: "corrupted" });

    await expect(getAuthorityEpoch()).resolves.toBe(0);
  });
});

import { promises as nodeFs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { expect, vi } from "vitest";
import { TypegenError } from "../src/utils/errors";

/**
 * Captures the error a synchronous call throws so a test can assert on fields
 * (`code`, `cause`) that `expect(...).toThrow()` cannot reach. Fails the test
 * when nothing is thrown, so the "did not throw" case is never silent.
 */
export function thrownBy(fn: () => unknown): TypegenError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(TypegenError);
    return error as TypegenError;
  }

  throw new Error("expected the call to throw, but it returned normally");
}

const tempDirs: string[] = [];

/** A fresh directory under the OS temp dir; remove them all in `afterEach`. */
export async function makeTempDir(prefix: string): Promise<string> {
  const dir = await nodeFs.mkdtemp(join(tmpdir(), `${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

export async function removeTempDirs(): Promise<void> {
  const dirs = tempDirs.splice(0, tempDirs.length);
  await Promise.all(dirs.map((dir) => nodeFs.rm(dir, { recursive: true, force: true })));
}

export interface FakeEventSource {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

/**
 * Replaces the lazily imported `eventsource` module. Callers must import
 * `ApiClient` dynamically afterwards for the mock to apply.
 */
export function mockEventSource(): { instances: FakeEventSource[] } {
  const instances: FakeEventSource[] = [];

  vi.doMock("eventsource", () => ({
    EventSource: class implements FakeEventSource {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        instances.push(this);
      }
      close() {}
    },
  }));

  return { instances };
}

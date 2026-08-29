import { vi } from "vitest";
import type * as CoreModule from "../../src/Core";

export const coreCtorMock = vi.fn();
export const coreStartMock = vi.fn();
export const coreStopMock = vi.fn();

let instanceCounter = 0;

/** Id of the first `Core` constructed after `resetCoreMocks()`. */
export const FIRST_MOCK_CORE_ID = "mock-core-1";

/**
 * Factory for `vi.mock("../src/Core", …)`. `src/standalone.ts` compares
 * `getInstanceId()` values to tell a stale stop-handle from the live runtime,
 * so the double hands out distinct ids per construction.
 *
 * Usage, which keeps the mocks initialized before the hoisted `vi.mock` runs:
 *
 *     const { coreCtorMock, mockCoreModule } = await vi.hoisted(
 *       () => import("./helpers/mockCore"),
 *     );
 *     vi.mock("../src/Core", mockCoreModule);
 */
export async function mockCoreModule() {
  const actual = await vi.importActual<typeof CoreModule>("../../src/Core");
  return {
    ...actual,
    Core: class MockCore {
      private readonly id = `mock-core-${++instanceCounter}`;
      constructor(...args: unknown[]) {
        coreCtorMock(...args);
      }
      start(): void {
        coreStartMock();
      }
      stop(): void {
        coreStopMock();
      }
      getInstanceId(): string {
        return this.id;
      }
    },
  };
}

/** Clears the call records and restarts the instance-id sequence. */
export function resetCoreMocks(): void {
  coreCtorMock.mockReset();
  coreStartMock.mockReset();
  coreStopMock.mockReset();
  instanceCounter = 0;
}

import { vi } from "vitest";
import type * as CoreModule from "../../src/Core";

let instanceCounter = 0;

/** Id of the first `Core` constructed after `resetCoreMocks()`. */
export const FIRST_MOCK_CORE_ID = "mock-core-1";

/**
 * Factory for `vi.mock("../src/Core", …)`: an inert `Core` that hands out a
 * predictable instance id per construction, for suites about the plugin's
 * host contract (bridge, encoder, API scope) rather than the page. It records
 * no calls on purpose. What the editor does to the page is asserted through
 * the real runtime (see `tests/helpers/editorPage.ts`), never through a count
 * of Core constructions, starts or stops.
 *
 * Usage, which keeps the factory initialized before the hoisted `vi.mock` runs:
 *
 *     const { mockCoreModule } = await vi.hoisted(() => import("./helpers/mockCore"));
 *     vi.mock("../src/Core", mockCoreModule);
 */
export async function mockCoreModule() {
  const actual = await vi.importActual<typeof CoreModule>("../../src/Core");
  return {
    ...actual,
    Core: class MockCore {
      private readonly id = `mock-core-${++instanceCounter}`;
      start(): void {}
      stop(): void {}
      getInstanceId(): string {
        return this.id;
      }
    },
  };
}

/** Restarts the instance-id sequence. */
export function resetCoreMocks(): void {
  instanceCounter = 0;
}

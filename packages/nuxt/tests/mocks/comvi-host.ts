import { vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Stand-in for the build-time `#build/comvi.host` template (src/module.ts).
 *
 * The real module is generated per app and takes the base-vs-`hostModule` branch
 * at build time; the runtime code under test only calls these two functions.
 */
export const createComviI18n: Mock = vi.fn();
export const createComviCore: Mock = vi.fn();

export function resetComviHostMock() {
  createComviI18n.mockReset();
  createComviCore.mockReset();
}

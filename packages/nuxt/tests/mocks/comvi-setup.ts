import { vi } from "vitest";

export const runComviSetup = vi.fn(async () => undefined);

export function resetComviSetupMock() {
  runComviSetup.mockReset();
  runComviSetup.mockResolvedValue(undefined);
}

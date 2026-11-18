/** Counters of the server process (lot 7 e2e): instances created / destroyed, loads aborted. */
export const probe: { created: number; destroyed: number; aborted: number } = ((
  globalThis as { __comviProbe?: { created: number; destroyed: number; aborted: number } }
).__comviProbe ||= { created: 0, destroyed: 0, aborted: 0 });

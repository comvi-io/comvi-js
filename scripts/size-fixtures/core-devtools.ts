// @comvi/core/devtools alone (R3-15 thin hook, ceiling = measured × 1.05): the queue entry
// { v, i, x }, the handle's delegates and x.load — the bytes `plugins: [devtools()]` adds.
import { devtools } from "@comvi/core/devtools";

export const out = devtools();

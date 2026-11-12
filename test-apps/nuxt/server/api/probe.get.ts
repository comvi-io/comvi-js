import { probe } from "../../app/probe";

// Lifecycle e2e: the server process's counters (`?reset` zeroes them).
export default defineEventHandler((event) => {
  const out = { ...probe };
  if ("reset" in getQuery(event)) Object.assign(probe, { created: 0, destroyed: 0, aborted: 0 });
  return out;
});

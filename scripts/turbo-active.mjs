#!/usr/bin/env node
// `turbo run <args>` minus every MIGRATION_PENDING package (tooling/migration-pending.mjs).
//
//   node scripts/turbo-active.mjs run build --filter='./packages/*'
//
// Appends `--filter=!<name>` per pending package; with no positive filter turbo then
// selects every workspace package except those. A pending package can still BUILD as a
// dependency of an active one (turbo's `^build`) — none does today.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import url from "node:url";
import { MIGRATION_PENDING } from "../tooling/migration-pending.mjs";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const exclusions = Object.keys(MIGRATION_PENDING).map((name) => `--filter=!${name}`);
console.log(`turbo-active: excluding ${exclusions.length} MIGRATION_PENDING package(s)`);
const turbo = createRequire(path.join(ROOT, "package.json")).resolve("turbo/bin/turbo");
const r = spawnSync(process.execPath, [turbo, ...args, ...exclusions], {
  stdio: "inherit",
  cwd: ROOT,
});
process.exit(r.status ?? 1);

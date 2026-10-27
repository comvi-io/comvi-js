#!/usr/bin/env node
// Runs a command unless a package it needs is MIGRATION_PENDING (tooling/migration-pending.mjs).
//
//   node scripts/unless-pending.mjs <gate> <pkg>[,<pkg>…] -- <command> [args…]
//
// Pending: prints why and exits 0 without running the command. Active: runs it with the
// shell and exits with its status.
import { spawnSync } from "node:child_process";
import { exitIfPending } from "../tooling/migration-pending.mjs";

const [gate, needs, sep, ...command] = process.argv.slice(2);
if (!gate || !needs || sep !== "--" || command.length === 0) {
  console.error("usage: unless-pending.mjs <gate> <pkg>[,<pkg>…] -- <command> [args…]");
  process.exit(2);
}
exitIfPending(gate, needs.split(","));
const r = spawnSync(command.join(" "), { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);

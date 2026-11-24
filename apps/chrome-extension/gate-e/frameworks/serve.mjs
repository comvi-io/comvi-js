// Starts an SSR row's production server on loopback and copies everything it prints to
// test-results/ssr-<name>.log, which frameworks-ssr.spec.ts reads: a server that touched a
// browser-only API, or failed a render, says so there.
//
//   node gate-e/frameworks/serve.mjs next|nuxt
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const BIN = join(DIR, "../../node_modules/.bin");
const LOGS = join(DIR, "../../test-results");

export const SSR_SERVERS = {
  next: { port: 8792, command: [join(BIN, "next"), "start", "-H", "127.0.0.1", "-p", "8792"] },
  nuxt: { port: 8793, command: [process.execPath, ".output/server/index.mjs"] },
};

const name = process.argv[2];
const server = SSR_SERVERS[name];
if (!server) {
  console.error(`usage: serve.mjs ${Object.keys(SSR_SERVERS).join("|")}`);
  process.exit(2);
}
mkdirSync(LOGS, { recursive: true });
const log = createWriteStream(join(LOGS, `ssr-${name}.log`));
const [command, ...args] = server.command;
const child = spawn(command, args, {
  cwd: join(DIR, name),
  env: { ...process.env, NITRO_HOST: "127.0.0.1", NITRO_PORT: String(server.port) },
  stdio: ["ignore", "pipe", "pipe"],
});
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    log.write(chunk);
    process.stdout.write(chunk);
  });
}
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));

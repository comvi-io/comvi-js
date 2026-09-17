import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";

/**
 * The slice of `event.node.res` the server utilities touch: `once` and
 * `writableEnded`.
 *
 * h3 1.x always gives an event a node response — the web adapter builds one
 * with node-mock-http — so a hand-made event in a unit test has to carry one
 * too, or it is not the shape the code under test ever sees. Nothing here
 * emits: a test that cares about the teardown drives a real h3 server instead
 * (`server-request-cleanup.test.ts`).
 */
export function nodeResponseStub(): ServerResponse {
  const res = new EventEmitter() as EventEmitter & { writableEnded: boolean };
  res.writableEnded = false;
  return res as unknown as ServerResponse;
}

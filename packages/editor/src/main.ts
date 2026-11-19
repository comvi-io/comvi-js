/**
 * Manual init/stop for standalone use; prefer `inContextEditorPlugin`.
 * One runtime at a time: `init()` stops the one a previous `init()` started.
 */

import { Core } from "./Core";
import type { TranslationSystemOptions } from "./types";

let core: Core | null = null;

export function init(options?: TranslationSystemOptions) {
  stop();
  core = new Core(options);
  core.start();
}

export function stop() {
  const current = core;
  core = null;
  current?.stop();
}

export * from "./translation";

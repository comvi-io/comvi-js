/** Manual init/stop for standalone use; prefer `InContextEditorPlugin`. */

import { Core } from "./Core";
import type { TranslationSystemOptions } from "./types";

let core: Core | null = null;

export function init(options?: TranslationSystemOptions) {
  core = new Core(options);
  core.start();
}

export function stop() {
  if (core) {
    core.stop();
  }
}

export * from "./translation";

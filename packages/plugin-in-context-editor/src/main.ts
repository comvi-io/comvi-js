/**
 * Main entry point for manual initialization
 *
 * Provides init/stop functions for standalone usage without the plugin system.
 * For most use cases, prefer using InContextEditorPlugin from index.ts.
 */

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

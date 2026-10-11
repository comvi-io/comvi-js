import { afterEach } from "vitest";
import { clearTemplateCache, _resetMissingParamWarnings } from "../src/core/translate";
import { _resetTagWarnings } from "../src/core/translate/parser";
import { _resetFormatterCaches } from "../src/format";

// Module-level state that outlives a test: the devtools discovery global that every host with
// the default `exposeGlobal` writes, the template cache and the dev warn-dedup sets. Syntax
// extensions are NOT reset here — files that register them ambiently own that lifecycle.
afterEach(() => {
  delete (globalThis as { __COMVI__?: unknown }).__COMVI__;
  clearTemplateCache();
  _resetMissingParamWarnings();
  _resetTagWarnings();
  _resetFormatterCaches();
});

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { _resetDiagnostics } from "../../core/src/errors";
import { _resetIntlCache } from "../../core/src/compile/fmt";
import { _resetLocaleCache } from "../../core/src/locale";

// React Testing Library unmounts after each test only with globals it can see; the
// core's module-level caches (dev dedupe, Intl, likely subtags) outlive a test too.
afterEach(() => {
  cleanup();
  _resetDiagnostics();
  _resetIntlCache();
  _resetLocaleCache();
});

// React's act() environment flag (happy-dom is not jsdom).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

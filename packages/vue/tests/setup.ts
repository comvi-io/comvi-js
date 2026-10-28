import { afterEach } from "vitest";
import { enableAutoUnmount } from "@vue/test-utils";
import { _resetDiagnostics } from "../../core/src/errors";
import { _resetIntlCache } from "../../core/src/compile/fmt";
import { _resetLocaleCache } from "../../core/src/locale";

// Every mounted wrapper is unmounted after its test; the core's module-level caches (dev
// dedupe, Intl, likely subtags) outlive a test too.
enableAutoUnmount(afterEach);
afterEach(() => {
  _resetDiagnostics();
  _resetIntlCache();
  _resetLocaleCache();
});

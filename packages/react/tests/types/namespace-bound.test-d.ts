/**
 * P9 PROBE: `useI18n(ns)` binds `t` / `tRaw` to a namespace at RUNTIME, so the
 * TYPE must narrow to that namespace's own keys — exact for its keys, rejecting
 * a key from another namespace and one no namespace declares. Solid narrowed
 * from the start; react took `ns?: string`, which leaves no inference site.
 *
 * The augmentation merges with default-params.test-d.ts's, which already
 * closes `TranslationKeys` for this program.
 */
import { useI18n } from "../../src/index";

declare module "@comvi/core" {
  interface TranslationKeys {
    "admin:dashboard": never;
    "admin:settings": { count: number };
    "shop:checkout": never;
  }
}

// A CALL, not an instantiation expression: the probe must read the same on the
// pre-fix signature, where `ns` is a plain `string`.
const admin = useI18n("admin");

// Exact: the namespace's own keys, bare.
admin.t("dashboard");
admin.t("settings", { count: 1 });
admin.tRaw("dashboard");

// @ts-expect-error a key from ANOTHER namespace is not an admin key
admin.t("checkout");
// @ts-expect-error a key no namespace declares
admin.t("nope");
// @ts-expect-error `settings` declares a required param
admin.t("settings");
// @ts-expect-error the same rejection on the rich-text half
admin.tRaw("checkout");

// The explicit `{ ns }` form is untouched by the binding.
admin.t("checkout", { ns: "shop" });

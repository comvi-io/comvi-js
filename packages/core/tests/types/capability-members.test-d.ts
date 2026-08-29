// Type-level gate: `LOADER_MEMBERS` / `PLUGIN_MEMBERS` in `utils/capability.ts`
// must list EVERY public member of the interface they stand for, and nothing
// else.
//
// They are not just the probe lists behind `hasLoaderApi` / `hasPluginHostApi`
// any more: `attachPlugins` installs one throwing stand-in per LOADER_MEMBERS
// entry on a plugins-only host (B4). A member added to `I18nLoaderApi` and
// forgotten there would silently go back to `TypeError: … is not a function`,
// and a runtime test cannot catch that — the member set is a TYPE.
//
// The `as const satisfies readonly (keyof …)[]` at the declarations rejects a
// name that is NOT a member; the assignments below reject a member that is
// missing from the list. Zero runtime cost: this file is only compiled
// (`pnpm --filter @comvi/core test:types`).
import { LOADER_MEMBERS, PLUGIN_MEMBERS } from "../../src/utils/capability";
import type { I18nLoaderApi, I18nPluginHostApi } from "../../src/types";

declare const someLoaderMember: keyof I18nLoaderApi;
declare const somePluginMember: keyof I18nPluginHostApi;

// Fails to compile with "Type '"…"' is not assignable to type …" naming the
// member that LOADER_MEMBERS is missing.
export const everyLoaderMemberIsListed: (typeof LOADER_MEMBERS)[number] = someLoaderMember;

export const everyPluginMemberIsListed: (typeof PLUGIN_MEMBERS)[number] = somePluginMember;

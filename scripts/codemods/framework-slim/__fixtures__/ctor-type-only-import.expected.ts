// A runtime installer must not be merged into a declaration-level type import.
import { createI18n } from "@comvi/core";
import type { DevtoolsOptions } from "@comvi/core/devtools";
import { devtools } from "@comvi/core/devtools";

const documented: DevtoolsOptions = { exposeGlobal: false };
export const i18n = createI18n({ locale: "en" }).with(devtools({ exposeGlobal: documented.exposeGlobal }));

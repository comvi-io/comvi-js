/** The outcome table of `setLocale()` / `load()` on the source, `__DEV__` true (tests/outcomes.ts). */
import { createI18n } from "../../src/instance";
import { core } from "../../src/internal";
import { outcomeTable, switcherTable } from "../outcomes";

const api = { createI18n, core, dev: true };
outcomeTable("source, development", () => api);
switcherTable("source, development", () => api);

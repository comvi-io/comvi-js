/** The outcome table of `setLocale()` / `load()` on the source, `__DEV__` false (tests/outcomes.ts). */
import { createI18n } from "../../src/instance";
import { core } from "../../src/internal";
import { outcomeTable, switcherTable } from "../outcomes";

const api = { createI18n, core, dev: false };
outcomeTable("source, production", () => api);
switcherTable("source, production", () => api);

/**
 * `@comvi/next/server`: the request-scoped server helper. Server only: a Client Component that
 * imports this entry fails the build (`server-only` resolves to a module that throws outside
 * the `react-server` condition), so a server loader and its credentials never reach the
 * browser graph.
 */
import "server-only";

export { createGetI18n } from "./server/getI18n";
export type { GetI18n, GetI18nOptions, NextI18nOptions, ServerI18n } from "./server/getI18n";

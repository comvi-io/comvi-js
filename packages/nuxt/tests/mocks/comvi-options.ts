/**
 * The generated `#build/comvi.options` / `#comvi/options`, as a test steers it: the `comvi`
 * data of nuxt.config and the options factory of `comvi.i18n.ts`.
 */
import type { I18nOptionsFactory } from "../../src/types";

export const config: Record<string, unknown> = { timeZone: "UTC" };
export let options: I18nOptionsFactory = () => ({});

export function setComviOptions(data: Record<string, unknown>, factory?: I18nOptionsFactory) {
  for (const k of Object.keys(config)) delete config[k];
  Object.assign(config, { timeZone: "UTC" }, data);
  options = factory ?? (() => ({}));
}

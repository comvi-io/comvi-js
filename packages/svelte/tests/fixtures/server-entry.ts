// Loaded through Vite's SSR pipeline by hydration.test.ts: the server build of the fixture.
import { render } from "svelte/server";
import { createI18n, handover } from "../../src";
import AccountApp from "./AccountApp.svelte";

export const serve = async (o: object, load: (l: string) => Promise<object>, ns: string) => {
  const i18n = createI18n({ ...o, onError() {}, loader: (l: string) => load(l) } as never);
  await i18n.load(ns).catch(() => {});
  const { body } = render(AccountApp, { props: { i18n } });
  return { body, payload: JSON.parse(JSON.stringify(handover(i18n))) };
};

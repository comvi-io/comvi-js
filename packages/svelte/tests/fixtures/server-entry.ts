// Loaded through Vite's SSR pipeline by hydration.test.ts: the server build of the fixture.
import { render } from "svelte/server";
import { createI18n, handover } from "../../src";
import AccountApp from "./AccountApp.svelte";
import GlobalApp from "./GlobalApp.svelte";
import RichApp from "./RichApp.svelte";

export const serve = async (o: object, load: (l: string) => Promise<object>, ns: string) => {
  const i18n = createI18n({ ...o, onError() {}, loader: (l: string) => load(l) } as never);
  await i18n.load(ns).catch(() => {});
  const { body } = render(AccountApp, { props: { i18n } });
  return { body, payload: JSON.parse(JSON.stringify(handover(i18n))) };
};

/** The probe's rich page (RichApp) rendered by the server build, with its handover. */
export const serveRich = (messages: object) => {
  const i18n = createI18n({ locale: "en", timeZone: "UTC", messages: { en: messages } } as never);
  const { body } = render(RichApp, { props: { i18n } });
  return { body, payload: JSON.parse(JSON.stringify(handover(i18n))) };
};

/** `useI18n()`'s page (GlobalApp) rendered by the server build once the startup loads are in. */
export const serveGlobal = async (o: object) => {
  const i18n = createI18n({ ...o, onError() {} } as never);
  await i18n.ready;
  const { body } = render(GlobalApp, { props: { i18n } });
  return { body, payload: JSON.parse(JSON.stringify(handover(i18n))) };
};

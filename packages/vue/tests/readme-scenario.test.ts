/**
 * Lot 4b completion criterion (owner brief 29.10): the README's Vue app behaves predictably
 * on success, a slow load, an error, a fast double switch and a hydration. The components
 * are the README's (`App` with its toggle button from "Setup", the `<T>` of "Markup in a
 * translation" with `components` and a slot, `Account` from "Retry with `load()`"), the loader
 * stands for `cdn()`, the app mounts after `i18n.ready` as the README says. The README switches
 * between `en` and `uk`; a third locale is reached through `i18n.setLocale()`. No case may leave
 * an unhandled rejection or a raw key the contract does not name.
 */
import { createApp, createSSRApp, defineComponent, h, nextTick, ref, type Ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createI18n, handover, T, useI18n, type VueI18n } from "../src";
import { manualLoader, settle, vueWarnings } from "./helpers";

const CATALOGS = {
  "en:default": {
    greeting: "Hello, {name}!",
    terms: "Read the <link>terms</link>, <b>in <i>full</i></b>.",
  },
  "uk:default": {
    greeting: "Привіт, {name}!",
    terms: "Прочитайте <link>умови</link>, <b>усі <i>повністю</i></b>.",
  },
  "de:default": {
    greeting: "Hallo, {name}!",
    terms: "Lies die <link>AGB</link>, <b>ganz <i>vollständig</i></b>.",
  },
};

/** The `locale` ref of the last `App` set up: a `v-model` control would write to it. */
let localeRef!: Ref<string>;

/** The README's `src/App.vue` (as a render function), plus its markup example. */
const App = defineComponent({
  setup() {
    const { t, locale, setLocale } = useI18n();
    localeRef = locale;
    return () => [
      h(
        "button",
        { class: "greeting", onClick: () => setLocale(locale.value === "en" ? "uk" : "en") },
        t("greeting", { name: "Alice" }),
      ),
      h("p", [
        h(
          T as never,
          { i18nKey: "terms", components: { b: "strong", i: "em" } },
          { link: ({ children }: { children: string }) => h("a", { href: "/terms" }, children) },
        ),
      ]),
    ];
  },
});

let rejections: unknown[] = [];
const onRejection = (e: unknown) => rejections.push(e);
beforeEach(() => {
  rejections = [];
  process.on("unhandledRejection", onRejection);
});
afterEach(async () => {
  await new Promise((y) => setTimeout(y, 0));
  process.off("unhandledRejection", onRejection);
  expect(rejections).toEqual([]);
});

const start = async (first: "answer" | "fail" = "answer") => {
  const l = manualLoader(CATALOGS);
  const errors: string[] = [];
  const i18n = createI18n({
    locale: "en",
    fallbackLocale: "en",
    loader: l.load,
    onError: (e) => errors.push(`${e.code} ${e.locale}`),
  });
  const el = document.createElement("div");
  const app = createApp(App).use(i18n);
  // README: mount once the first catalogs are in.
  const mounted = i18n.ready.then(() => app.mount(el));
  await l[first]("en:default");
  await mounted;
  await settle();
  const h1 = () => el.querySelector("button.greeting")?.textContent;
  /** A click on the README's toggle: `en` to `uk` and back. */
  const toggle = async () => {
    el.querySelector<HTMLButtonElement>("button.greeting")!.click();
    await settle();
  };
  /** A switch to a locale the toggle does not reach, as a caller that ignores the result. */
  const pick = async (v: string) => {
    void i18n.setLocale(v);
    await settle();
  };
  return { l, i18n, el, h1, toggle, pick, errors, app };
};

describe("README Vue app (lot 4b)", () => {
  it("success: the text once mounted; components render the nested markup; a switch in place", async () => {
    const s = await start();
    expect(s.h1()).toBe("Hello, Alice!");
    expect(s.el.querySelector("p")!.innerHTML).toBe(
      'Read the <a href="/terms">terms</a>, <strong>in <em>full</em></strong>.',
    );
    await s.toggle();
    await s.l.answer("uk:default");
    expect([s.h1(), s.i18n.locale]).toEqual(["Привіт, Alice!", "uk"]);
    expect(s.errors).toEqual([]);
  });

  it("slow load: the old locale's text stays until the new one is in", async () => {
    const s = await start();
    await s.toggle();
    expect([s.h1(), s.i18n.locale]).toEqual(["Hello, Alice!", "en"]);
    await s.l.answer("uk:default");
    expect([s.h1(), s.i18n.locale]).toEqual(["Привіт, Alice!", "uk"]);
  });

  it("error: a failed switch through the writable `locale` keeps the locale, the ref shows it again, nothing unhandled", async () => {
    const s = await start();
    localeRef.value = "de"; // what a `v-model` control does
    await settle();
    await s.l.fail("de:default");
    await settle();
    expect([s.h1(), localeRef.value, s.i18n.locale]).toEqual(["Hello, Alice!", "en", "en"]);
    expect(s.errors).toEqual(["load_failed de"]);
  });

  it("error on the first load: ready settles, the app mounts with the keys", async () => {
    const s = await start("fail");
    expect(s.h1()).toBe("greeting");
    expect(s.errors[0]).toBe("load_failed en");
  });

  it("fast double switch: the last one wins, the earlier never shows", async () => {
    const s = await start();
    await s.toggle();
    await s.pick("de");
    expect(s.l.signals.get("uk:default")!.aborted).toBe(true);
    await s.l.answer("de:default");
    expect([s.h1(), s.i18n.locale]).toEqual(["Hallo, Alice!", "de"]);
    expect(s.errors).toEqual([]);
  });

  it("hydration: the server's text, no mismatch, 0 requests for what the server sent", async () => {
    const serverLoader = manualLoader(CATALOGS);
    const server = createI18n({
      locale: "uk",
      fallbackLocale: "en",
      timeZone: "UTC",
      loader: serverLoader.load,
    });
    const ready = server.ready;
    await serverLoader.answer("uk:default");
    await serverLoader.answer("en:default");
    await ready;
    const html = await renderToString(createSSRApp(App).use(server));
    const payload = JSON.parse(JSON.stringify(handover(server)));
    const el = document.createElement("div");
    el.innerHTML = html;
    const l = manualLoader(CATALOGS);
    const client: VueI18n = createI18n({ fallbackLocale: "en", ...payload, loader: l.load });
    const warnings = await vueWarnings(async () => {
      createSSRApp(App).use(client).mount(el);
      await nextTick();
      await settle();
    });
    expect(warnings).toEqual([]);
    expect(el.innerHTML).toBe(html);
    expect(el.querySelector("button.greeting")!.textContent).toBe("Привіт, Alice!");
    expect(l.requested).toEqual([]);
  });
});

/**
 * The README's `src/Account.vue` (lot 4c), as its template compiles: a branch on isReady, a
 * retry through `i18n.load()`, and a switch that reports its failure.
 */
const Account = defineComponent({
  setup() {
    const { t, locale, setLocale, isReady, isLoading, i18n } = useI18n("account");
    const failed = ref(false);
    async function toggle() {
      failed.value = false;
      const failure = await setLocale(locale.value === "en" ? "uk" : "en");
      if (failure !== undefined) failed.value = true;
    }
    const retry = () => void i18n.load("account"); // isReady and isLoading follow the retry
    return () => [
      isLoading.value
        ? h("p", { class: "spinner" })
        : !isReady.value
          ? h("button", { class: "retry", onClick: retry }, "Not available. Retry")
          : h("h2", t("title")),
      h(
        "button",
        { class: "switch", onClick: toggle },
        failed.value ? "Could not switch. Try again" : locale.value,
      ),
    ];
  },
});

const ACCOUNT = {
  ...CATALOGS,
  "en:account": { title: "Account" },
  "uk:account": { title: "Обліковий запис" },
  "de:account": { title: "Konto" },
};

describe("README Account (lot 4c)", () => {
  const mount = async () => {
    const l = manualLoader(ACCOUNT);
    const errors: string[] = [];
    const i18n = createI18n({
      locale: "en",
      loader: l.load,
      onError: (e) => errors.push(`${e.code} ${e.locale}`),
    });
    const shown = ref(true);
    const el = document.createElement("div");
    const app = createApp(
      defineComponent({ setup: () => () => [h(App), shown.value ? h(Account) : null] }),
    ).use(i18n);
    const mounted = i18n.ready.then(() => app.mount(el));
    await l.answer("en:default");
    await mounted;
    await settle();
    const account = () => el.querySelector("h2, p.spinner, button.retry")?.outerHTML;
    const click = async (name: "retry" | "switch") => {
      el.querySelector<HTMLButtonElement>(`button.${name}`)!.click();
      await settle();
    };
    const switcher = () => el.querySelector("button.switch")!.textContent;
    const pick = async (v: string) => {
      void i18n.setLocale(v);
      await settle();
    };
    const show = async (b: boolean) => {
      shown.value = b;
      await settle();
    };
    return { l, i18n, account, click, switcher, pick, show, errors, app };
  };

  it("success: the spinner while it loads, then the title; a switch while mounted loads it too", async () => {
    const s = await mount();
    expect(s.account()).toBe('<p class="spinner"></p>');
    await s.l.answer("en:account");
    expect(s.account()).toBe("<h2>Account</h2>");
    await s.click("switch"); // the README's toggle: en to uk
    expect(s.l.requested).toEqual(["en:default", "en:account", "uk:default", "uk:account"]);
    await s.l.answer("uk:default");
    expect(s.account()).toBe("<h2>Account</h2>"); // the switch waits for account
    await s.l.answer("uk:account");
    expect(s.account()).toBe("<h2>Обліковий запис</h2>");
    expect(s.errors).toEqual([]);
    s.app.unmount();
  });

  it("error: 'Not available', never a spinner forever; the Retry button's i18n.load() retries", async () => {
    const s = await mount();
    await s.l.fail("en:account");
    expect(s.account()).toBe('<button class="retry">Not available. Retry</button>');
    expect(s.errors).toEqual(["load_failed en"]);
    await s.click("retry"); // still failing: load() resolves with the Error, the branch stays
    expect(s.account()).toBe('<p class="spinner"></p>');
    await s.l.fail("en:account");
    expect(s.account()).toBe('<button class="retry">Not available. Retry</button>');
    await s.click("retry");
    await s.l.answer("en:account");
    expect(s.account()).toBe("<h2>Account</h2>");
    expect(s.l.requested.filter((r) => r === "en:account")).toHaveLength(3);
    s.app.unmount();
  });

  it("a refused setLocale(): the locale and the text stay, the button says so; a second click asks again", async () => {
    const s = await mount();
    await s.l.answer("en:account");
    await s.click("switch");
    await s.l.fail("uk:default");
    await s.l.fail("uk:account");
    await settle();
    expect([s.account(), s.switcher(), s.i18n.locale]).toEqual([
      "<h2>Account</h2>",
      "Could not switch. Try again",
      "en",
    ]);
    expect(s.errors).toEqual(["load_failed uk", "load_failed uk"]);
    await s.click("switch");
    await s.l.answer("uk:default");
    await s.l.answer("uk:account");
    await settle();
    expect([s.account(), s.switcher()]).toEqual(["<h2>Обліковий запис</h2>", "uk"]);
    s.app.unmount();
  });

  it("fast double switch: the last wins, account included", async () => {
    const s = await mount();
    await s.l.answer("en:account");
    await s.pick("uk");
    await s.pick("de");
    expect(s.l.signals.get("uk:account")!.aborted).toBe(true);
    await s.l.answer("de:default");
    await s.l.answer("de:account");
    expect(s.account()).toBe("<h2>Konto</h2>");
    s.app.unmount();
  });

  it("unmounted, then a switch: only default loads; mounted again it loads for the new locale", async () => {
    const s = await mount();
    await s.l.answer("en:account");
    await s.show(false);
    await s.pick("de");
    await s.l.answer("de:default");
    expect(s.l.requested).toEqual(["en:default", "en:account", "de:default"]);
    await s.show(true);
    expect(s.account()).toBe('<p class="spinner"></p>');
    await s.l.answer("de:account");
    expect(s.account()).toBe("<h2>Konto</h2>");
    s.app.unmount();
  });

  it("hydration: the server's useI18n loads it before the render; the same branch, 0 requests", async () => {
    const server = createI18n({
      locale: "uk",
      timeZone: "UTC",
      loader: async (l, n) => ACCOUNT[`${l}:${n}` as keyof typeof ACCOUNT],
    });
    await server.ready;
    const html = await renderToString(createSSRApp(Account).use(server));
    expect(html).toBe('<!--[--><h2>Обліковий запис</h2><button class="switch">uk</button><!--]-->');
    const l = manualLoader(ACCOUNT);
    const client = createI18n({
      locale: "en",
      loader: l.load,
      ...JSON.parse(JSON.stringify(handover(server))),
    });
    const el = document.createElement("div");
    el.innerHTML = html;
    const app = createSSRApp(Account).use(client);
    const warnings = await vueWarnings(async () => {
      app.mount(el);
      await settle();
    });
    expect([warnings, el.innerHTML, l.requested]).toEqual([[], html, []]);
    app.unmount();
  });
});

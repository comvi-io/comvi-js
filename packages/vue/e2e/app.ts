/**
 * The app of the SSR handover gate (R3-21): the same components on the server and in the
 * browser. The server renders `uk` with the `account` and `legal` namespaces its route loads
 * (`legal` is translated in `en` only: the server renders it through the fallback chain);
 * `help` is a later view's namespace the server never sent, `de` a locale it never sent.
 */
import { defineComponent, h, ref } from "vue";
import { cdn } from "@comvi/core/cdn";
import { T, useI18n, type I18nOptions } from "@comvi/vue";

export const options = (base: string): Omit<I18nOptions, "locale"> => ({
  fallbackLocale: "en",
  timeZone: "UTC",
  loader: cdn(base),
});

const Help = defineComponent({
  setup() {
    const { t } = useI18n("help");
    return () => h("aside", { "data-testid": "help" }, t("faq"));
  },
});

export const App = defineComponent({
  setup() {
    const { t, locale } = useI18n();
    const account = useI18n("account");
    const legal = useI18n("legal");
    const help = ref(false);
    return () =>
      h("main", [
        h("p", { "data-testid": "greeting" }, t("hi", { name: "Ann" })),
        h("p", { "data-testid": "only" }, t("only")),
        h("p", { "data-testid": "title" }, account.t("title")),
        h("p", { "data-testid": "legal" }, legal.t("notice")),
        h("p", { "data-testid": "terms" }, [
          h(
            T as never,
            { i18nKey: "terms" },
            { link: ({ children }: { children: string }) => h("a", { href: "/terms" }, children) },
          ),
        ]),
        h("span", { "data-testid": "locale" }, locale.value),
        h("button", { "data-testid": "help-open", onClick: () => (help.value = true) }, "?"),
        h("button", { "data-testid": "to-de", onClick: () => (locale.value = "de") }, "de"),
        help.value ? h(Help) : null,
      ]);
  },
});

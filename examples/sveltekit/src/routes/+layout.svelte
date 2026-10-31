<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import { page } from "$app/state";
  import { createI18n, setI18n, useI18n } from "@comvi/svelte";
  import { localePath, locales, options } from "../lib/i18n";
  import type { LayoutData } from "./$types";
  import "../app.css";

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  // The root layout stays mounted across client navigation, so the instance is built once,
  // from the first payload: the server's own catalogs, nothing to ask the loader for.
  const i18n = untrack(() => createI18n({ ...options, ...data }));

  setI18n(i18n);

  // Every later payload (a link to /uk, Back) switches the same instance. A `null` slot is
  // a load that failed on the server.
  $effect.pre(() => {
    for (const ns in data.catalogs)
      for (const locale in data.catalogs[ns]) {
        const catalog = data.catalogs[ns]![locale];
        if (catalog) i18n.add(locale, catalog, ns);
      }
    // The first payload is the locale already: a switch would ask again for what failed.
    if (data.locale != i18n.locale) i18n.setLocale(data.locale).catch(() => {});
  });

  const r = useI18n();
  const t = r.t;

  $effect(() => {
    document.documentElement.lang = r.locale;
    document.documentElement.dir = r.dir;
  });

  // This page's path without its locale prefix, for the switcher's links.
  const path = $derived(page.route.id?.replace("/[[locale]]", "") || "/");
</script>

<main>
  <header>
    <h1>{t("app.title")}</h1>
    <nav class="switcher" aria-label={t("app.language")}>
      {#each locales as code (code)}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- localePath() builds the path -->
        <a href={localePath(code, path)}
          data-testid="locale-{code}"
          aria-current={r.locale === code ? "page" : undefined}>{code}</a
        >
      {/each}
    </nav>
  </header>
  {@render children()}
</main>

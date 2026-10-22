<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import { page } from "$app/state";
  import { createI18n, icuCompiler, setI18nContext, useI18n } from "@comvi/svelte";
  import { catalogLoader, fallbackLocale, localePath, locales } from "../lib/i18n";
  import type { LayoutData } from "./$types";
  import "../app.css";

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  // The root layout stays mounted across client navigation, so the instance is
  // built once, from the first payload.
  const i18n = untrack(() =>
    createI18n({
      locale: data.locale,
      fallbackLocale,
      compiler: icuCompiler,
      messages: data.messages,
    }).use(catalogLoader()),
  );

  setI18nContext(i18n);

  // Every later payload (a link to /uk, Back) switches the same instance.
  $effect.pre(() => {
    i18n.addMessages(data.messages);
    i18n.setLocale(data.locale).catch(() => {});
  });

  const { t, locale, dir } = useI18n();

  $effect(() => {
    document.documentElement.lang = $locale;
    document.documentElement.dir = $dir;
  });

  // This page's path without its locale prefix, for the switcher's links.
  const path = $derived(page.route.id?.replace("/[[locale]]", "") || "/");
</script>

<main>
  <header>
    <h1>{$t("app.title")}</h1>
    <nav class="switcher" aria-label={$t("app.language")}>
      {#each locales as code (code)}
        <a
          href={localePath(code, path)}
          data-testid="locale-{code}"
          aria-current={$locale === code ? "page" : undefined}>{code}</a
        >
      {/each}
    </nav>
  </header>
  {@render children()}
</main>

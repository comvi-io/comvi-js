<script lang="ts">
  import { setI18nContext, useI18n, T } from '@comvi/svelte';
  import { i18n, locales } from './i18n';

  // Publishes the instance to every descendant and — because `autoInit`
  // defaults to true — calls `i18n.init()`, which runs the plugins and loads
  // the first catalog.
  setI18nContext(i18n);

  // Everything reactive here is a STORE: `$`-prefix it at the call site.
  const {
    t,
    locale,
    dir,
    setLocale,
    isLoading,
    cacheRevision,
    formatNumber,
    formatDate,
    getLoadedLocales,
  } = useI18n();

  let count = $state(2);
  const RELEASED = new Date('2026-09-01T00:00:00Z');

  // `$effect` — not a top-level statement: the document is only there to touch
  // after the component has mounted, and this re-runs whenever the locale moves.
  $effect(() => {
    document.documentElement.lang = $locale;
    document.documentElement.dir = $dir;
  });

  // The formatters are plain functions, not stores: they read the current
  // locale when called, so the `$t` read above is what makes this recompute.
  const summary = $derived(
    $t('stats.summary', {
      views: formatNumber(1234567),
      date: formatDate(RELEASED, { dateStyle: 'long' }),
    }),
  );

  // `getLoadedLocales()` is a plain call too; `$cacheRevision` is the store
  // that ticks when a catalog lands.
  const fetched = $derived.by(() => {
    void $cacheRevision;
    return $t('loader.fetched', { locales: getLoadedLocales().join(', ') });
  });
</script>

<main>
  <h1>{$t('app.title')}</h1>

  <!-- 1 — locale switcher -->
  <section>
    <h2>{$t('app.language')}</h2>
    <div class="row">
      {#each locales as code (code)}
        <button aria-pressed={$locale === code} onclick={() => setLocale(code)}>{code}</button>
      {/each}
      {#if $isLoading}<code>{$t('app.loading')}</code>{/if}
    </div>
  </section>

  <!-- 2 — a string with a parameter -->
  <section>
    <h2>interpolation</h2>
    <p>{$t('greeting.hello', { name: 'Ada' })}</p>
  </section>

  <!-- 3 — an ICU plural, live on a counter -->
  <section>
    <h2>plural</h2>
    <div class="row">
      <button onclick={() => (count = Math.max(0, count - 1))}>−</button>
      <button onclick={() => count++}>+</button>
      <span>{$t('cart.items', { count })}</span>
    </div>
  </section>

  <!--
    4 — <T> with a tag: the catalog holds <link>…</link>, the app decides what
    that renders as. The tag grammar travels per call, so plain `t()` elsewhere
    is unaffected.
  -->
  <section>
    <h2>tag interpolation</h2>
    <p>
      <T
        i18nKey="docs.read_more"
        components={{
          link: {
            tag: 'a',
            props: { href: 'https://comvi.io/docs', target: '_blank', rel: 'noreferrer' },
          },
        }}
      />
    </p>
  </section>

  <!-- 5 — date and number formatting, interpolated as params -->
  <section>
    <h2>formatting</h2>
    <p>{summary}</p>
  </section>

  <!-- 6 — proof the loader is lazy: only the locales you visited are here -->
  <section>
    <h2>lazy loading</h2>
    <p><code>{fetched}</code></p>
  </section>
</main>

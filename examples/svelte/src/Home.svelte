<script lang="ts">
  import { useI18n, T } from '@comvi/svelte';
  import { link } from './router';

  let { name }: { name: string } = $props();

  const { t, cacheRevision, formatNumber, formatDate, getLoadedLocales, getActiveNamespaces } =
    useI18n();

  let count = $state(2);
  const RELEASED = new Date('2026-09-01T00:00:00Z');

  // The formatters are plain functions, not stores: they read the current
  // locale when called, so the `$t` read is what makes this recompute.
  const summary = $derived(
    $t('stats.summary', {
      views: formatNumber(1234567),
      date: formatDate(RELEASED, { dateStyle: 'long' }),
    }),
  );

  // `getLoadedLocales()` and `getActiveNamespaces()` are plain calls;
  // `$cacheRevision` is the store that ticks when a catalog lands.
  const fetched = $derived.by(() => {
    void $cacheRevision;
    return $t('loader.fetched', { locales: getLoadedLocales().join(', ') });
  });
  const namespaces = $derived.by(() => {
    void $cacheRevision;
    return $t('demo.lazy.namespaces', { namespaces: getActiveNamespaces().join(', ') });
  });
</script>

<div class="cards">
  <!-- A string with a parameter -->
  <section class="card">
    <h2 class="eyebrow">{$t('demo.interpolation.title')}</h2>
    <p class="card-body">{$t('demo.interpolation.body')}</p>
    <p class="widget" data-testid="greeting">{$t('greeting.hello', { name })}</p>
  </section>

  <!-- An ICU plural, live on a counter -->
  <section class="card">
    <h2 class="eyebrow">{$t('demo.plural.title')}</h2>
    <p class="card-body">{$t('demo.plural.body')}</p>
    <div class="widget counter">
      <button data-testid="cart-dec" onclick={() => (count = Math.max(0, count - 1))}
        >−</button
      >
      <button data-testid="cart-inc" onclick={() => count++}>+</button>
      <span data-testid="cart">{$t('cart.items', { count })}</span>
    </div>
  </section>

  <!--
    <T> with a tag: the catalog holds <link>…</link>, the app decides what that
    renders as. The tag grammar travels per call, so plain `t()` elsewhere is
    unaffected.
  -->
  <section class="card">
    <h2 class="eyebrow">{$t('demo.tags.title')}</h2>
    <p class="card-body">{$t('demo.tags.body')}</p>
    <p class="widget" data-testid="read-more">
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

  <!-- Date and number formatting, interpolated as params -->
  <section class="card">
    <h2 class="eyebrow">{$t('demo.formatting.title')}</h2>
    <p class="card-body">{$t('demo.formatting.body')}</p>
    <p class="widget">{summary}</p>
  </section>

  <!-- Proof the loader is lazy: only the locales and namespaces in use are here -->
  <section class="card">
    <h2 class="eyebrow">{$t('demo.lazy.title')}</h2>
    <p class="card-body">{$t('demo.lazy.body')}</p>
    <p class="network">
      <span data-testid="fetched">{fetched}</span>
      <span>{namespaces}</span>
    </p>
  </section>

  <!--
    Fallback: uk has no `fallback.only_en`, so uk renders the en text; a key no
    catalog has renders as the key itself
  -->
  <section class="card">
    <h2 class="eyebrow">{$t('demo.fallback.title')}</h2>
    <p class="card-body">{$t('demo.fallback.body')}</p>
    <p class="widget" data-testid="fallback">{$t('fallback.only_en')}</p>
    <p class="widget"><code data-testid="missing-key">{$t('fallback.nowhere')}</code></p>
  </section>

  <!-- A missing parameter renders as its own placeholder -->
  <section class="card">
    <h2 class="eyebrow">{$t('demo.missing.title')}</h2>
    <p class="card-body">{$t('demo.missing.body')}</p>
    <p class="widget" data-testid="missing-param">{$t('greeting.hello', {})}</p>
  </section>

  <!-- A second page; the locale is not part of the path here -->
  <section class="card">
    <h2 class="eyebrow">{$t('demo.navigation.title')}</h2>
    <p class="card-body">{$t('demo.navigation.body')}</p>
    <p class="widget">
      <a data-testid="nav-about" href="/about" use:link>{$t('demo.navigation.cta')}</a>
    </p>
  </section>
</div>

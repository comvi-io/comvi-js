<script lang="ts">
  import { setI18nContext, useI18n, T } from '@comvi/svelte';
  import Account from './Account.svelte';
  import { i18n, locales, rtlLocale } from './i18n';

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
    isInitializing,
    cacheRevision,
    formatNumber,
    formatDate,
    getLoadedLocales,
  } = useI18n();

  let count = $state(2);

  // A second view, so the locale can be seen surviving a navigation. No router
  // dependency: `history.pushState` and `popstate` are the whole of it, and
  // `vite preview` serves index.html for /about on a reload.
  type View = 'home' | 'about';
  const viewFromPath = (): View => (location.pathname === '/about' ? 'about' : 'home');
  let view = $state(viewFromPath());
  $effect(() => {
    const onPop = () => (view = viewFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });
  const go = (to: View) => (event: MouseEvent) => {
    event.preventDefault();
    history.pushState(null, '', to === 'about' ? '/about' : '/');
    view = to;
  };
  const RELEASED = new Date('2026-09-01T00:00:00Z');

  // The greeting's `{name}`: 'Ada', or `?name=…` from the address bar. Whatever
  // arrives there is a parameter, and a parameter is rendered as text, never as
  // markup: try `?name=<b>Grace</b>`.
  const name = new URLSearchParams(location.search).get('name') ?? 'Ada';

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

<!-- `setI18nContext` starts `init()`; until the first catalog is in, show this
     rather than raw keys. -->
{#if $isInitializing}
  <p>Loading…</p>
{:else}
<main>
  <h1>{$t('app.title')}</h1>

  <!-- 1 — locale switcher -->
  <section>
    <h2>{$t('app.language')}</h2>
    <div class="row">
      {#each locales as code (code)}
        <button
          data-testid="locale-{code}"
          aria-pressed={$locale === code}
          onclick={() => setLocale(code)}>{code}</button>
      {/each}
      <!-- Not in the switcher: the right-to-left locale the e2e suite uses. -->
      <button hidden data-testid="locale-{rtlLocale}" onclick={() => setLocale(rtlLocale)}
        >{rtlLocale}</button
      >
      {#if $isLoading}<code>{$t('app.loading')}</code>{/if}
    </div>
  </section>

  {#if view === 'about'}
  <section>
    <h2>navigation</h2>
    <p data-testid="about-body">{$t('about.body')}</p>
    <p><a data-testid="nav-home" href="/" onclick={go('home')}>{$t('nav.home')}</a></p>
  </section>
  <!-- 10 — a second namespace, fetched when this view is first shown -->
  <Account {name} />
  {:else}
  <!-- 2 — a string with a parameter -->
  <section>
    <h2>interpolation</h2>
    <p data-testid="greeting">{$t('greeting.hello', { name })}</p>
  </section>

  <!-- 3 — an ICU plural, live on a counter -->
  <section>
    <h2>plural</h2>
    <div class="row">
      <button data-testid="cart-dec" onclick={() => (count = Math.max(0, count - 1))}>−</button>
      <button data-testid="cart-inc" onclick={() => count++}>+</button>
      <span data-testid="cart">{$t('cart.items', { count })}</span>
    </div>
  </section>

  <!--
    4 — <T> with a tag: the catalog holds <link>…</link>, the app decides what
    that renders as. The tag grammar travels per call, so plain `t()` elsewhere
    is unaffected.
  -->
  <section>
    <h2>tag interpolation</h2>
    <p data-testid="read-more">
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
    <p><code data-testid="fetched">{fetched}</code></p>
  </section>

  <!-- 7 — a second view; the locale is not part of the path here -->
  <section>
    <h2>navigation</h2>
    <p>
      <a data-testid="nav-about" href="/about" onclick={go('about')}>{$t('nav.about')}</a>
    </p>
  </section>

  <!--
    8 — fallback: uk has no `fallback.only_en`, so uk renders the en text; a key
    no catalog has renders as the key itself
  -->
  <section>
    <h2>fallback</h2>
    <p data-testid="fallback">{$t('fallback.only_en')}</p>
    <p><code data-testid="missing-key">{$t('fallback.nowhere')}</code></p>
  </section>

  <!-- 9 — a missing parameter renders as its own placeholder -->
  <section>
    <h2>missing parameter</h2>
    <p data-testid="missing-param">{$t('greeting.hello', {})}</p>
  </section>
  {/if}
</main>
{/if}

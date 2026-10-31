<script lang="ts">
  import { T, useI18n } from "@comvi/svelte";
  import { localePath } from "../../lib/i18n";

  const r = useI18n();
  const t = r.t;

  let count = $state(1);

  // What `<link>` in the catalog becomes: the translator places the tag, the
  // app owns the element.
  const components = {
    link: { component: "a", props: { href: "https://comvi.io/docs/i18n/ssr" } },
  };
</script>

<p data-testid="greeting">{t("greeting.hello", { name: "Ada" })}</p>
<section class="card">
  <div class="counter">
    <button
      data-testid="cart-dec"
      aria-label={t("demo.plural.dec")}
      onclick={() => (count = Math.max(0, count - 1))}>−</button
    >
    <span data-testid="cart">{t("cart.items", { count })}</span>
    <button data-testid="cart-inc" aria-label={t("demo.plural.inc")} onclick={() => count++}
      >+</button
    >
  </div>
  <p data-testid="read-more"><T i18nKey="docs.read_more" {components} /></p>
  <p class="muted" data-testid="only-en">{t("fallback.only_en")}</p>
</section>
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- localePath() builds the path -->
<p><a data-testid="nav-about" href={localePath(r.locale, "/about")}>{t("nav.about")}</a></p>

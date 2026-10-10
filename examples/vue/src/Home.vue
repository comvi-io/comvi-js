<script setup lang="ts">
import { ref } from "vue";
import { RouterLink } from "vue-router";
import { T, useI18n } from "@comvi/vue";
import Card from "./Card.vue";

defineProps<{ name: string }>();

// `loadedLocales` and `activeNamespaces` are computed refs: a catalog landing or
// a namespace activating re-renders the lines that read them.
const { t, formatNumber, formatDate, loadedLocales, activeNamespaces } = useI18n();

const count = ref(2);
const RELEASED = new Date("2026-09-01T00:00:00Z");
</script>

<template>
  <div class="cards">
    <!-- A string with a parameter -->
    <Card feature="interpolation">
      <p class="widget" data-testid="greeting">{{ t("greeting.hello", { name }) }}</p>
    </Card>

    <!-- An ICU plural, live on a counter -->
    <Card feature="plural">
      <div class="counter widget">
        <button data-testid="cart-dec" @click="count = Math.max(0, count - 1)">−</button>
        <button data-testid="cart-inc" @click="count++">+</button>
        <span data-testid="cart">{{ t("cart.items", { count }) }}</span>
      </div>
    </Card>

    <!-- <T> with a tag: the catalog holds <link>…</link>, the app decides what
         that renders as. The tag grammar travels per call, so plain `t()`
         elsewhere is unaffected. -->
    <Card feature="tags">
      <p class="widget" data-testid="read-more">
        <T
          i18n-key="docs.read_more"
          :components="{
            link: {
              component: 'a',
              props: { href: 'https://comvi.io/docs', target: '_blank', rel: 'noreferrer' },
            },
          }"
        />
      </p>
    </Card>

    <!-- Date and number formatting, interpolated as params -->
    <Card feature="formatting">
      <p class="widget">
        {{
          t("stats.summary", {
            views: formatNumber(1234567),
            date: formatDate(RELEASED, { dateStyle: "long" }),
          })
        }}
      </p>
    </Card>

    <!-- Proof the loader is lazy: only the locales you visited are here, and
         only the namespaces something activated -->
    <Card feature="lazy">
      <div class="net">
        <code data-testid="fetched">{{
          t("loader.fetched", { locales: loadedLocales.join(", ") })
        }}</code>
        <code>{{ t("demo.lazy.namespaces", { namespaces: activeNamespaces.join(", ") }) }}</code>
      </div>
    </Card>

    <!-- Fallback: uk has no `fallback.only_en`, so uk renders the en text; a key
         no catalog has renders as the key itself -->
    <Card feature="fallback">
      <p class="widget" data-testid="fallback">{{ t("fallback.only_en") }}</p>
      <p class="widget">
        <code data-testid="missing-key">{{ t("fallback.nowhere") }}</code>
      </p>
    </Card>

    <!-- A missing parameter renders as its own placeholder -->
    <Card feature="missing">
      <p class="widget" data-testid="missing-param">{{ t("greeting.hello", {}) }}</p>
    </Card>

    <!-- A second route; the locale is not part of the path here -->
    <Card feature="navigation">
      <p class="widget">
        <RouterLink data-testid="nav-about" to="/about">{{ t("demo.navigation.cta") }}</RouterLink>
      </p>
    </Card>
  </div>
</template>

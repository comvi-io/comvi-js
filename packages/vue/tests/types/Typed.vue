<!--
  Templates with generated catalogs: `$t` (ComponentCustomProperties) and `<T>` are typed by
  the keys; each `@vue-expect-error` must fire (vue-tsc, `pnpm test:types`).
-->
<script setup lang="ts">
import { T, useI18n } from "../../src";

const { t, locale } = useI18n();
const ShopT = useI18n("shop").T;
</script>

<template>
  <select v-model="locale">
    <option value="en">en</option>
  </select>
  <p>
    {{ $t("greeting", { name: "Ann" }) }}{{ t("title")
    }}{{ $t("cart.title", { ns: "shop", count: 1 }) }}
  </p>
  <p>
    <!-- @vue-expect-error typo key -->
    {{ $t("greting", { name: "Ann" }) }}
  </p>
  <p>
    <!-- @vue-expect-error missing param -->
    {{ $t("greeting") }}
  </p>
  <T i18n-key="greeting" name="Ann" />
  <!-- eslint-disable-next-line vue/attribute-hyphenation -- the camelCase spelling is typed too -->
  <T i18nKey="cart.title" ns="shop" :count="1" :markers="false" />
  <T i18n-key="terms">
    <template #link="{ children }"
      ><a href="/terms">{{ children }}</a></template
    >
  </T>
  <!-- @vue-expect-error unknown key -->
  <T i18n-key="greting" name="Ann" />
  <!-- @vue-expect-error missing param -->
  <T i18n-key="greeting" />
  <!-- @vue-expect-error a key of another namespace -->
  <T i18n-key="cart.title" :count="1" />
  <ShopT i18n-key="cart.title" :count="2" />
  <!-- @vue-expect-error a default-namespace key on the bound shop <T> -->
  <ShopT i18n-key="greeting" name="x" />
</template>

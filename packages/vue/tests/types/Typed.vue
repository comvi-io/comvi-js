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
  <!-- A kebab-case attribute is the camelCase param (the binding camelizes it at runtime). -->
  <T i18n-key="welcome" :first-name="'Ann'" />
  <!-- @vue-expect-error missing param: firstName -->
  <T i18n-key="welcome" />
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
  <!--
    A misspelt attribute that leaves a required param out (`nmae="Ann"`, DX review item 14)
    is gated by the types bench (vueTypo: vue-tsc's own error count), not here: vue-tsc hides
    the unknown attribute's TS2353, and a hidden error still satisfies @vue-expect-error.
  -->
  <!-- Any other attribute is a param of no message: allowed (nothing falls through). -->
  <T i18n-key="greeting" name="Ann" class="x" />
  <T i18n-key="terms" :components="{ link: 'a' }" />
  <!-- @vue-expect-error a key of another namespace -->
  <T i18n-key="cart.title" :count="1" />
  <ShopT i18n-key="cart.title" :count="2" />
  <!-- @vue-expect-error a default-namespace key on the bound shop <T> -->
  <ShopT i18n-key="greeting" name="x" />
</template>

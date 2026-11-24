<!--
  Negative types of the BUILT @comvi/vue `<T>` (`dist/*.d.ts`, through the workspace link)
  against the catalogs `comvi typegen` generates from ../locales. Never mounted: checked by
  `pnpm typecheck` (vue-tsc), where every `@vue-expect-error` must fire.
-->
<script setup lang="ts">
import { T, useI18n } from "@comvi/vue";

const AccountT = useI18n("account").T;
</script>

<template>
  <!-- Controls: each compiles. -->
  <T i18n-key="home.title" />
  <T i18n-key="home.intro" name="Ann" />
  <T i18n-key="rich_text.link_text">
    <template #link="{ children }"
      ><a href="/x">{{ children }}</a></template
    >
  </T>
  <T i18n-key="rich_text.link_text" :components="{ link: 'a' }" />
  <T i18n-key="profile.heading" ns="account" name="Ann" />
  <AccountT i18n-key="profile.heading" name="Ann" />
  <!--
    A tag param of `<T>` is optional (a slot of the tag's name may render it, and slots are not
    typed by the message), and `components` is not keyed by the message's tags: these compile.
  -->
  <T i18n-key="rich_text.link_text" />
  <T i18n-key="rich_text.link_text"
    ><template #lnk="{ children }">{{ children }}</template></T
  >
  <T i18n-key="rich_text.link_text" :components="{}" />
  <T i18n-key="rich_text.link_text" :components="{ link: 'a', lnk: 'a' }" />

  <!-- @vue-expect-error a key the catalog lacks -->
  <T i18n-key="home.titel" />
  <!-- @vue-expect-error a key of another namespace -->
  <T i18n-key="profile.heading" name="Ann" />
  <!-- @vue-expect-error a namespace that does not exist -->
  <T i18n-key="home.title" ns="acount" />
  <!-- @vue-expect-error a default-namespace key on the account <T> -->
  <AccountT i18n-key="home.title" />
  <!-- @vue-expect-error a missing param -->
  <T i18n-key="home.intro" />
  <!-- @vue-expect-error a missing param on the account <T> -->
  <AccountT i18n-key="profile.heading" />
  <!-- @vue-expect-error a count is a number -->
  <T i18n-key="plurals.items" count="2" />
  <!-- @vue-expect-error a missing param beside the components of a rich key -->
  <T i18n-key="rich_text.nested_mixed" :components="{ alert: 'p', bold: 'b', link: 'a' }" />
  <!-- @vue-expect-error a components entry that is no component -->
  <T i18n-key="rich_text.link_text" :components="{ link: 1 }" />
</template>

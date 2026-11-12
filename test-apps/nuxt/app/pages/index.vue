<script setup lang="ts">
const { t } = useI18n();
const { number, date } = useFormat();
// 2026-01-01 23:30 UTC: 2 January, 13:30 in the server's (and the app's) Pacific/Kiritimati.
const when = Date.UTC(2026, 0, 1, 23, 30);
</script>

<template>
  <section>
    <h1 data-testid="title">{{ t("home.title") }}</h1>
    <p data-testid="dollar-t">{{ $t("home.subtitle") }}</p>
    <p data-testid="param">{{ t("home.intro", { name: "Ada" }) }}</p>
    <p data-testid="plural">{{ t("plurals.items", { count: 2 }) }}</p>
    <p data-testid="rich">
      <T
        i18n-key="rich_text.nested_simple"
        :components="{
          link: { component: 'a', props: { href: 'https://comvi.io/docs' } },
          bold: 'b',
        }"
      />
    </p>
    <p data-testid="number">{{ number(1234.5) }}</p>
    <p data-testid="date">{{ date(when, { dateStyle: "long", timeStyle: "short" }) }}</p>
  </section>
</template>

<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <main>
    <p class="back">
      <NuxtLinkLocale to="/">{{ t("demo.start.back") }}</NuxtLinkLocale>
    </p>
    <AppHeader />
    <div class="cards">
      <GreetingCard />
      <PluralCard />
      <OrdinalCard />
      <SelectCard />
      <FormalityCard />
      <MarkupCard />
      <FormattingCard />
      <CallOptionsCard />
      <FallbackCard />
      <MissingParamCard />
      <ErrorsCard />
      <NavigationCard />
      <CatalogLoadingCard />
    </div>
    <AppFooter />
  </main>
</template>

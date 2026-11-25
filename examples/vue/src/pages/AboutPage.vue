<script setup lang="ts">
import { ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { useI18n } from "@comvi/vue";
import AccountDetails from "../components/AccountDetails.vue";
import FeatureCard from "../components/FeatureCard.vue";
import LoadError from "../components/LoadError.vue";
import NamespacesLine from "../components/NamespacesLine.vue";
import { useVisitorName } from "../name";

const name = useVisitorName();
const { t, i18n } = useI18n();

// Whether the route could not load the `account` namespace (main.ts); load() asks again.
const accountFailed = ref(useRoute().meta.accountFailed === true);
async function retry() {
  accountFailed.value = await i18n.load("account").then(
    () => false,
    () => true,
  );
}
</script>

<template>
  <div class="cards">
    <article class="card">
      <h2 class="eyebrow">{{ t("demo.navigation.title") }}</h2>
      <p class="widget" data-testid="about-body">{{ t("about.body") }}</p>
      <LoadError v-if="accountFailed" @retry="retry" />
      <AccountDetails v-else :name="name" />
      <p>
        <RouterLink data-testid="nav-home" to="/features">{{ t("nav.home") }}</RouterLink>
      </p>
    </article>

    <FeatureCard feature="lazy">
      <div class="net">
        <NamespacesLine />
      </div>
    </FeatureCard>
  </div>
</template>

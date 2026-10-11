<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useI18n } from "@comvi/vue";
import AccountDetails from "../components/AccountDetails.vue";
import FeatureCard from "../components/FeatureCard.vue";
import NamespacesLine from "../components/NamespacesLine.vue";
import { useVisitorName } from "../name";

const name = useVisitorName();
const { t } = useI18n();
</script>

<template>
  <div class="cards">
    <article class="card">
      <h2 class="eyebrow">{{ t("demo.navigation.title") }}</h2>
      <p class="widget" data-testid="about-body">{{ t("about.body") }}</p>
      <AccountDetails :name="name" />
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

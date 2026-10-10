<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useI18n } from "@comvi/vue";
import Account from "./Account.vue";
import Card from "./Card.vue";

defineProps<{ name: string }>();
const { t, activeNamespaces } = useI18n();
</script>

<template>
  <div class="cards">
    <article class="card">
      <h2 class="eyebrow">{{ t("demo.navigation.title") }}</h2>
      <p class="widget" data-testid="about-body">{{ t("about.body") }}</p>
      <!-- A second namespace, fetched when this route is first shown -->
      <Account :name="name" />
      <p>
        <RouterLink data-testid="nav-home" to="/">{{ t("nav.home") }}</RouterLink>
      </p>
    </article>

    <!-- What this route just loaded: `account` joins the active namespaces. -->
    <Card feature="lazy">
      <div class="net">
        <code>{{ t("demo.lazy.namespaces", { namespaces: activeNamespaces.join(", ") }) }}</code>
      </div>
    </Card>
  </div>
</template>

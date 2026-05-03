<script setup lang="ts">
import { type Ref, getCurrentInstance, onMounted, watch } from "vue";
import KeySelectorDropdown from "@/components/KeySelectorDropdown.vue";
import { useTheme } from "@/composables/useTheme";

defineProps<{
  keyData: Array<{ key: string; ns: string; textPreview?: string }>;
  position: { top: number; left: number };
  open: Ref<boolean>;
  defaultNs?: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "select", key: string, ns: string): void;
}>();

const theme = useTheme();
const instance = getCurrentInstance();

function findShadowHost(): HTMLElement | null {
  const el = instance?.proxy?.$el as Node | undefined;
  if (!el) return null;
  const root = el.getRootNode();
  if (root instanceof ShadowRoot) {
    return root.host as HTMLElement;
  }
  return null;
}

function applyTheme(value: "light" | "dark") {
  const host = findShadowHost();
  if (!host) return;
  host.classList.toggle("dark", value === "dark");
}

onMounted(() => applyTheme(theme.theme.value));
watch(theme.theme, applyTheme);
</script>

<template>
  <KeySelectorDropdown
    :key-data="keyData"
    :position="position"
    :open="open"
    :default-ns="defaultNs"
    @update:open="emit('update:open', $event)"
    @select="(key, ns) => emit('select', key, ns)"
  />
</template>

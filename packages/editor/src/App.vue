<script setup lang="ts">
import { type Ref, provide, watch, onMounted, getCurrentInstance } from "vue";
import EditModal from "@/components/EditModal.vue";
import ToastContainer from "@/components/ui/toast/ToastContainer.vue";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createToastManager, TOAST_INJECTION_KEY } from "@/composables/useToast";
import { useTheme, THEME_INJECTION_KEY } from "@/composables/useTheme";

defineProps<{
  translationKey: Ref<string>;
  translationNamespace: Ref<string>;
  translationInstanceId: Ref<string | undefined>;
  open: Ref<boolean>;
}>();

const emit = defineEmits<{ (e: "update:open", value: boolean): void }>();

const toastManager = createToastManager();
provide(TOAST_INJECTION_KEY, toastManager);

const theme = useTheme();
provide(THEME_INJECTION_KEY, theme);

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
  <TooltipProvider :delay-duration="200">
    <EditModal
      :open="open"
      :translation-key="translationKey"
      :translation-namespace="translationNamespace"
      :translation-instance-id="translationInstanceId"
      @update:open="emit('update:open', $event)"
    />
    <ToastContainer />
  </TooltipProvider>
</template>

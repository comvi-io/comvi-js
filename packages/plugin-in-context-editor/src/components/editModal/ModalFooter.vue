<script setup lang="ts">
import { computed, inject, ref, type Ref } from "vue";
import { Button } from "@/components/ui/button";

const emit = defineEmits<{ (e: "closeModal"): void }>();

const translationManager = inject<any>("translationManager");
const handleSaveOnly = inject<() => Promise<unknown>>("handleSaveOnly");
const handleSaveAndClose = inject<() => Promise<void>>("handleSaveAndClose");
const isInDemoMode = inject<Ref<boolean>>("isInDemoMode", ref(false));

if (!translationManager || !handleSaveOnly || !handleSaveAndClose) {
  throw new Error("translationManager or save handlers not provided");
}

const isSaving = ref(false);

const isMac = computed(() => {
  if (typeof navigator === "undefined") return false;
  const platform =
    navigator.platform ||
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    "";
  return /mac|iphone|ipad|ipod/i.test(platform) || /Mac/.test(navigator.userAgent);
});

const saveShortcut = computed(() => (isMac.value ? "⌘S" : "Ctrl+S"));

async function onSave() {
  isSaving.value = true;
  try {
    await handleSaveOnly!();
  } finally {
    isSaving.value = false;
  }
}

async function onSaveAndClose() {
  isSaving.value = true;
  try {
    await handleSaveAndClose!();
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="border-t p-3 flex justify-between items-center w-full bg-background">
    <Button variant="outline" :disabled="isSaving" @click="emit('closeModal')">Cancel</Button>

    <div class="flex items-center gap-3">
      <span
        v-if="!isInDemoMode"
        class="text-[10px] font-mono tracking-mono uppercase text-muted-foreground"
        aria-hidden="true"
      >
        {{ saveShortcut }} to save
      </span>
      <div class="flex gap-2">
        <Button
          variant="outline"
          :disabled="isSaving || !translationManager.hasUnsavedChanges.value || isInDemoMode"
          :title="isInDemoMode ? 'Saving is disabled in demo mode' : `Save (${saveShortcut})`"
          @click="onSave"
        >
          {{ isSaving ? "Saving..." : "Save" }}
        </Button>
        <Button
          variant="default"
          :disabled="isSaving || !translationManager.hasUnsavedChanges.value || isInDemoMode"
          :title="isInDemoMode ? 'Saving is disabled in demo mode' : 'Save & Close'"
          @click="onSaveAndClose"
        >
          {{ isSaving ? "Saving..." : "Save & Close" }}
        </Button>
      </div>
    </div>
  </div>
</template>

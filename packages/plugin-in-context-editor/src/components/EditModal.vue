<script setup lang="ts">
import { type Ref, ref, watch, provide, inject, onUnmounted, computed, unref } from "vue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ModalHeader from "@/components/editModal/ModalHeader.vue";
import ModalFooter from "@/components/editModal/ModalFooter.vue";
import ModalBody from "@/components/editModal/ModalBody.vue";
import { useTranslations } from "@/composables/useTranslations";
import { getLanguages } from "@/services/languageService";
import { isDemoMode } from "@/config/api";
import { TOAST_INJECTION_KEY } from "@/composables/useToast";
import type { Language } from "@/types";

// Toast notifications
const toast = inject(TOAST_INJECTION_KEY);

const LOCALSTORAGE_KEY = "i18n-editor-selected-languages";

const props = defineProps<{
  open: Ref<boolean>;
  translationKey: Ref<string>;
  translationNamespace: Ref<string>;
  translationInstanceId: Ref<string | undefined>;
}>();

const isInDemoMode = computed(() => {
  const instanceId = unref(props.translationInstanceId);
  return isDemoMode(instanceId);
});

const emit = defineEmits<{ (e: "update:open", value: boolean): void }>();

const isOpenInternal = ref(props.open.value);
const languages = ref<Language[]>([]);
const isLoadingLanguages = ref(true);
const selectedLanguageCodes = ref<string[]>([]);
let latestLanguageRequestId = 0;

watch(isOpenInternal, (value) => {
  emit("update:open", value);
});

watch(props.open, (value) => {
  isOpenInternal.value = value;
});

function restoreSelectedLanguages(availableLanguages: Language[]): string[] {
  const stored = localStorage.getItem(LOCALSTORAGE_KEY);
  if (!stored) {
    return availableLanguages.map((lang) => lang.code);
  }

  try {
    const storedCodes = JSON.parse(stored);
    const validCodes = storedCodes.filter((code: string) =>
      availableLanguages.some((lang) => lang.code === code),
    );
    return validCodes.length > 0 ? validCodes : availableLanguages.map((lang) => lang.code);
  } catch {
    return availableLanguages.map((lang) => lang.code);
  }
}

async function loadLanguagesForCurrentInstance(): Promise<void> {
  const requestId = ++latestLanguageRequestId;
  isLoadingLanguages.value = true;
  languages.value = [];
  selectedLanguageCodes.value = [];

  try {
    const instanceId = unref(props.translationInstanceId);
    const loadedLanguages = await getLanguages(instanceId);
    if (requestId !== latestLanguageRequestId) {
      return;
    }

    languages.value = loadedLanguages;
    selectedLanguageCodes.value = restoreSelectedLanguages(loadedLanguages);
  } catch (error) {
    if (requestId !== latestLanguageRequestId) {
      return;
    }

    console.error("Failed to load languages:", error);
    languages.value = [];
    selectedLanguageCodes.value = [];
  } finally {
    if (requestId === latestLanguageRequestId) {
      isLoadingLanguages.value = false;
    }
  }
}

watch(
  () => [isOpenInternal.value, unref(props.translationInstanceId)],
  ([open]) => {
    if (open) {
      void loadLanguagesForCurrentInstance();
    }
  },
  { immediate: true },
);

// Watch selected languages and save to localStorage
watch(
  selectedLanguageCodes,
  (newCodes) => {
    if (languages.value.length === 0) {
      return;
    }
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(newCodes));
  },
  { deep: true },
);

// Compute filtered languages based on selection
const filteredLanguages = computed(() => {
  return languages.value.filter((lang) => selectedLanguageCodes.value.includes(lang.code));
});

// Initialize translation state management
const translationManager = useTranslations(languages, props.translationInstanceId);

// Provide translation manager to child components
provide("translationManager", translationManager);

// Provide demo mode flag to child components
provide("isInDemoMode", isInDemoMode);

// Load translation when modal opens or when key/namespace changes while open
watch(
  () => [isOpenInternal.value, unref(props.translationKey), unref(props.translationNamespace)],
  () => {
    if (isOpenInternal.value) {
      translationManager.loadTranslation(
        unref(props.translationKey),
        unref(props.translationNamespace),
      );
    }
  },
  { immediate: true },
);

// Handle save without closing
async function handleSaveOnly() {
  const savedData = await translationManager.saveTranslation();
  if (savedData) {
    toast?.addToast({
      title: "Saved",
      description: "Translation saved successfully",
      variant: "success",
    });
  } else if (translationManager.state.value.error) {
    toast?.addToast({
      title: "Error",
      description: translationManager.state.value.error,
      variant: "error",
    });
  }
  return savedData;
}

// Handle save and close
async function handleSaveAndClose() {
  const savedData = await handleSaveOnly();
  if (savedData) {
    isOpenInternal.value = false;
  }
}

// Provide save handlers to children
provide("handleSaveOnly", handleSaveOnly);
provide("handleSaveAndClose", handleSaveAndClose);

// Keyboard shortcut: Ctrl/Cmd+S to save (without closing)
function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    event.preventDefault();
    event.stopPropagation();
    if (translationManager.hasUnsavedChanges.value && !translationManager.state.value.isLoading) {
      handleSaveOnly();
    }
  }
}

watch(isOpenInternal, (open) => {
  if (open) {
    document.addEventListener("keydown", handleKeydown);
  } else {
    document.removeEventListener("keydown", handleKeydown);
  }
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeydown);
});

// Unsaved changes warning
const showUnsavedWarning = ref(false);

function tryClose() {
  if (translationManager.hasUnsavedChanges.value) {
    showUnsavedWarning.value = true;
  } else {
    isOpenInternal.value = false;
  }
}

function forceClose() {
  showUnsavedWarning.value = false;
  isOpenInternal.value = false;
}

function handleEscapeKeyDown(event: KeyboardEvent) {
  if (translationManager.hasUnsavedChanges.value) {
    event.preventDefault();
    showUnsavedWarning.value = true;
  }
}

function handleInteractOutside(event: Event) {
  if (translationManager.hasUnsavedChanges.value) {
    event.preventDefault();
    showUnsavedWarning.value = true;
    return;
  }

  isOpenInternal.value = false;
}
</script>

<template>
  <Dialog v-model:open="isOpenInternal">
    <DialogContent
      hide-close-button
      :class="isInDemoMode ? 'w-full max-w-lg' : 'w-full max-w-6xl'"
      @escape-key-down="handleEscapeKeyDown"
      @interact-outside="handleInteractOutside"
    >
      <!-- Demo mode: simplified view -->
      <div v-if="isInDemoMode" class="flex flex-col p-6">
        <div class="flex items-center gap-3 mb-6">
          <div
            class="p-3 bg-warn/12 text-warn border border-warn/30 flex items-center justify-center"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
          <div>
            <DialogTitle class="text-lg font-semibold text-foreground">
              API Key Not Configured
            </DialogTitle>
            <DialogDescription class="text-sm text-muted-foreground">
              Configure an API key to edit translations
            </DialogDescription>
          </div>
        </div>

        <div class="bg-surface-2 border border-border p-4 mb-6">
          <div class="text-[10px] font-mono tracking-mono uppercase text-muted-foreground mb-1">
            Translation Key
          </div>
          <div class="font-mono text-sm text-foreground break-all">{{ translationKey }}</div>
          <div v-if="translationNamespace" class="mt-3">
            <div class="text-[10px] font-mono tracking-mono uppercase text-muted-foreground mb-1">
              Namespace
            </div>
            <div class="font-mono text-sm text-foreground">{{ translationNamespace }}</div>
          </div>
        </div>

        <Button class="w-full" @click="isOpenInternal = false"> Close </Button>
      </div>

      <!-- Normal mode: full editor -->
      <div v-else class="flex flex-col h-[90vh] max-h-[90vh]">
        <DialogHeader>
          <ModalHeader
            :translation-key="translationKey"
            :languages="languages"
            :selected-language-codes="selectedLanguageCodes"
            @update:selected-language-codes="selectedLanguageCodes = $event"
          />
        </DialogHeader>
        <ModalBody
          :translation-key="translationKey"
          :translation-namespace="translationNamespace"
          :languages="filteredLanguages"
          :is-loading-languages="isLoadingLanguages"
        />
        <DialogFooter>
          <ModalFooter @close-modal="tryClose" />
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Unsaved changes confirmation dialog -->
  <Dialog v-model:open="showUnsavedWarning">
    <DialogContent class="w-full max-w-sm p-6">
      <DialogHeader>
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogDescription>
          You have unsaved changes. Are you sure you want to close?
        </DialogDescription>
      </DialogHeader>
      <div class="flex justify-end gap-2 mt-4">
        <Button variant="outline" @click="showUnsavedWarning = false">Keep Editing</Button>
        <Button variant="destructive" @click="forceClose">Discard</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

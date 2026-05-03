<script setup lang="ts">
import { ref, onMounted, onUnmounted, type Ref } from "vue";
import { Loader2 } from "@lucide/vue";
import { getTranslation } from "@/services/translationService";

interface KeyDataItem {
  key: string;
  ns: string;
  textPreview?: string;
}

interface TranslationPreview {
  key: string;
  ns: string;
  preview: string;
  isLoading: boolean;
}

const props = defineProps<{
  keyData: KeyDataItem[];
  position: { top: number; left: number };
  open: Ref<boolean>;
  defaultNs?: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "select", key: string, ns: string): void;
}>();

const dropdownRef = ref<HTMLElement | null>(null);
const translationPreviews = ref<Map<string, TranslationPreview>>(new Map());
const getPreviewMapKey = (key: string, ns: string) => `${ns}:${key}`;

onMounted(async () => {
  for (const item of props.keyData) {
    const previewMapKey = getPreviewMapKey(item.key, item.ns);
    translationPreviews.value.set(previewMapKey, {
      key: item.key,
      ns: item.ns,
      preview: "",
      isLoading: true,
    });

    try {
      const translationData = await getTranslation(item.key, item.ns);
      const firstLang = Object.keys(translationData?.translations || {})[0];
      const firstForm = firstLang
        ? Object.keys(translationData?.translations[firstLang] || {})[0]
        : null;

      let preview = "(No translation yet)";
      if (firstLang && firstForm) {
        const fullText = translationData?.translations[firstLang]?.[firstForm] || "";
        preview = fullText.length > 60 ? fullText.substring(0, 60) + "..." : fullText;
      }

      translationPreviews.value.set(previewMapKey, {
        key: item.key,
        ns: item.ns,
        preview,
        isLoading: false,
      });
    } catch (error) {
      console.error("Error loading translation preview:", error);
      translationPreviews.value.set(previewMapKey, {
        key: item.key,
        ns: item.ns,
        preview: "(Error loading)",
        isLoading: false,
      });
    }
  }
});

const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value) {
    const path = event.composedPath();
    const isInsideDropdown = path.includes(dropdownRef.value);

    if (!isInsideDropdown) {
      emit("update:open", false);
    }
  }
};

const handleEscape = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    emit("update:open", false);
  }
};

onMounted(() => {
  setTimeout(() => {
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
  }, 0);
});

onUnmounted(() => {
  document.removeEventListener("mousedown", handleClickOutside);
  document.removeEventListener("keydown", handleEscape);
});

const handleSelect = (key: string, ns: string) => {
  emit("select", key, ns);
};

const getPreview = (key: string, ns: string) => {
  const preview = translationPreviews.value.get(getPreviewMapKey(key, ns));
  if (preview?.isLoading) {
    return "Loading...";
  }
  return preview?.preview || "(No translation)";
};

const isLoading = (key: string, ns: string) => {
  return translationPreviews.value.get(getPreviewMapKey(key, ns))?.isLoading || false;
};
</script>

<template>
  <div
    v-if="open.value"
    ref="dropdownRef"
    role="listbox"
    aria-label="Select translation key"
    class="fixed z-[10001] bg-popover text-popover-foreground border border-border shadow-md overflow-hidden"
    :style="{
      top: `${position.top}px`,
      left: `${position.left}px`,
      width: '400px',
      maxHeight: '400px',
    }"
  >
    <div class="p-3 border-b border-border bg-surface-2">
      <h3 class="text-sm font-semibold text-foreground">Select Translation Key</h3>
      <p class="text-xs text-muted-foreground mt-0.5">Multiple keys found. Click one to edit:</p>
    </div>

    <div class="overflow-y-auto" style="max-height: 320px">
      <div
        v-for="item in keyData"
        :key="`${item.ns}:${item.key}`"
        role="option"
        class="p-3 hover:bg-accent-soft cursor-pointer border-b border-border transition-colors duration-150"
        @click="handleSelect(item.key, item.ns)"
      >
        <div class="flex items-start justify-between mb-1 gap-2">
          <div class="font-mono text-sm font-medium text-primary break-all">
            {{ item.key
            }}<span
              v-if="item.ns && item.ns !== defaultNs"
              class="text-muted-foreground font-normal"
            >
              ({{ item.ns }})</span
            >
          </div>
          <Loader2
            v-if="isLoading(item.key, item.ns)"
            class="animate-spin h-4 w-4 text-muted-foreground shrink-0"
          />
        </div>

        <div v-if="item.textPreview" class="text-xs text-muted-foreground mb-2 italic">
          Text: "{{
            item.textPreview.length > 50
              ? item.textPreview.substring(0, 50) + "..."
              : item.textPreview
          }}"
        </div>

        <div class="text-xs text-muted-foreground">
          <span v-if="isLoading(item.key, item.ns)" class="text-muted-foreground/70">
            Loading translation...
          </span>
          <span v-else>
            {{ getPreview(item.key, item.ns) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

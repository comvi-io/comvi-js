<script setup lang="ts">
import { useVModel } from "@vueuse/core";
import { ref, computed, watch, nextTick, onMounted, type HTMLAttributes } from "vue";

import { useTranslationHighlighter } from "@/composables/useTranslationHighlighter";
import { cn } from "@/lib/utils";

const RTL_LOCALES = ["ar", "he", "fa", "ur", "yi", "ps", "sd"];

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes["class"];
    defaultValue?: string | number;
    modelValue?: string | number;
    placeholder?: string;
    disabled?: boolean;
    /** Locale code for RTL detection (e.g., "ar", "he-IL") */
    localeCode?: string;
    /** Auto-grow textarea height to fit content */
    autoResize?: boolean;
    /** Minimum height in CSS units (e.g. "3rem", "60px") */
    minHeight?: string;
  }>(),
  {
    autoResize: true,
    minHeight: "60px",
  },
);

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void;
}>();

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
});

const textValue = computed(() => String(modelValue.value ?? ""));

const { highlightedHtml } = useTranslationHighlighter(textValue);

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const overlayRef = ref<HTMLDivElement | null>(null);

const isRtl = computed(() => {
  if (!props.localeCode) return false;
  const primaryLang = props.localeCode.split("-")[0]?.toLowerCase() ?? "";
  return RTL_LOCALES.includes(primaryLang);
});

const direction = computed(() => (isRtl.value ? "rtl" : "ltr"));

function syncScroll() {
  if (overlayRef.value && textareaRef.value) {
    overlayRef.value.scrollTop = textareaRef.value.scrollTop;
    overlayRef.value.scrollLeft = textareaRef.value.scrollLeft;
  }
}

function resize() {
  const el = textareaRef.value;
  if (!el || !props.autoResize) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

watch(textValue, () => {
  nextTick(() => {
    resize();
    syncScroll();
  });
});

onMounted(() => {
  nextTick(resize);
});

const focus = () => {
  textareaRef.value?.focus();
};

const insertAtCursor = (text: string) => {
  const el = textareaRef.value;
  if (!el) return;

  const start = el.selectionStart;
  const end = el.selectionEnd;
  const current = textValue.value;

  const before = current.slice(0, start);
  const after = current.slice(end);
  const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
  const needsSpaceAfter = after.length > 0 && !/^\s/.test(after);
  const inserted = (needsSpaceBefore ? " " : "") + text + (needsSpaceAfter ? " " : "");

  modelValue.value = before + inserted + after;

  const cursorPos = start + inserted.length;
  nextTick(() => {
    el.focus();
    el.setSelectionRange(cursorPos, cursorPos);
  });
};

defineExpose({
  focus,
  insertAtCursor,
});

const baseTextClasses =
  "text-sm leading-relaxed font-sans px-3 py-2 whitespace-pre-wrap break-words";
</script>

<template>
  <div class="relative w-full bg-background" :dir="direction" :style="{ minHeight }">
    <!-- eslint-disable vue/no-v-html -->
    <div
      ref="overlayRef"
      :class="
        cn(
          baseTextClasses,
          'absolute inset-0 overflow-hidden pointer-events-none',
          'border border-transparent',
          'z-0',
        )
      "
      aria-hidden="true"
      v-html="highlightedHtml || '&nbsp;'"
    />
    <!-- eslint-enable vue/no-v-html -->

    <textarea
      ref="textareaRef"
      v-model="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :dir="direction"
      :style="{ minHeight, caretColor: 'hsl(var(--foreground))' }"
      :class="
        cn(
          baseTextClasses,
          'flex w-full',
          'border border-input bg-transparent shadow-xs',
          'text-transparent selection:bg-primary/25 selection:text-transparent',
          'focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'placeholder:text-muted-foreground',
          'resize-none',
          'relative z-10',
          autoResize && 'overflow-hidden',
          props.class,
        )
      "
      @scroll="syncScroll"
      @input="resize"
    />
  </div>
</template>

<style scoped>
textarea::placeholder {
  color: hsl(var(--muted-foreground));
  opacity: 1;
}

textarea::selection {
  background-color: hsl(var(--primary) / 0.25);
}
</style>

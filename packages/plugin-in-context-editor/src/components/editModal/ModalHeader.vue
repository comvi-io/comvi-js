<script setup lang="ts">
import { type Ref, ref, computed, inject } from "vue";
import { Copy, Check, ChevronDown, Sun, Moon } from "@lucide/vue";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { THEME_INJECTION_KEY } from "@/composables/useTheme";
import type { Language } from "@/types";

const props = defineProps<{
  translationKey: Ref<string | number>;
  languages: Language[];
  selectedLanguageCodes: string[];
}>();

const emit = defineEmits<{
  (e: "update:selectedLanguageCodes", codes: string[]): void;
}>();

const buttonText = computed(() => {
  return `Languages · ${props.selectedLanguageCodes.length}/${props.languages.length}`;
});

function toggleLanguage(code: string) {
  const isSelected = props.selectedLanguageCodes.includes(code);

  if (isSelected) {
    if (props.selectedLanguageCodes.length === 1) {
      return;
    }
    emit(
      "update:selectedLanguageCodes",
      props.selectedLanguageCodes.filter((c) => c !== code),
    );
  } else {
    emit("update:selectedLanguageCodes", [...props.selectedLanguageCodes, code]);
  }
}

function selectAll() {
  emit(
    "update:selectedLanguageCodes",
    props.languages.map((l) => l.code),
  );
}

function deselectAll() {
  if (props.languages.length > 0) {
    emit("update:selectedLanguageCodes", [props.languages[0]!.code]);
  }
}

const copied = ref(false);
function copyKey() {
  navigator.clipboard.writeText(String(props.translationKey.value));
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 1500);
}

const theme = inject(THEME_INJECTION_KEY);
</script>

<template>
  <div class="flex items-center justify-between p-4 border-b sticky top-0 bg-background">
    <div class="flex items-center gap-3">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        class="h-8 w-8 text-foreground"
        fill="none"
        aria-label="Comvi"
      >
        <path d="M4 11V4h7" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" />
        <path d="M28 11V4h-7" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" />
        <path d="M4 21v7h7" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" />
        <path d="M28 21v7h-7" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" />
        <rect x="13" y="13" width="6" height="6" fill="#D97706" />
      </svg>
      <div>
        <DialogTitle class="text-base font-semibold">Translation Editor</DialogTitle>
        <DialogDescription class="text-sm">
          <span class="inline-flex items-center gap-1.5">
            <span class="text-muted-foreground">Key:</span>
            <code
              class="bg-surface-2 border border-line-2 text-foreground px-1.5 py-0.5 font-mono text-xs"
              >{{ translationKey }}</code
            >
            <button
              tabindex="-1"
              class="inline-flex items-center justify-center h-5 w-5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Copy key"
              @click="copyKey"
            >
              <Check v-if="copied" class="h-3.5 w-3.5 text-success" />
              <Copy v-else class="h-3.5 w-3.5" />
            </button>
          </span>
        </DialogDescription>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <Button
        v-if="theme"
        variant="outline"
        size="icon"
        class="h-8 w-8"
        :aria-label="
          theme.theme.value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
        "
        :title="theme.theme.value === 'dark' ? 'Switch to light' : 'Switch to dark'"
        @click="theme.toggle"
      >
        <Sun v-if="theme.theme.value === 'dark'" class="h-4 w-4" />
        <Moon v-else class="h-4 w-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm" aria-label="Select languages to display">
            <span>{{ buttonText }}</span>
            <ChevronDown class="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-64">
          <DropdownMenuItem class="cursor-pointer" @select.prevent="selectAll">
            <span class="font-medium">Select All</span>
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @select.prevent="deselectAll">
            <span class="font-medium">Deselect All</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            v-for="lang in languages"
            :key="lang.id"
            class="cursor-pointer"
            @select.prevent="toggleLanguage(lang.code)"
          >
            <div class="flex items-center w-full gap-2">
              <Checkbox
                :model-value="selectedLanguageCodes.includes(lang.code)"
                class="pointer-events-none"
              />
              <span class="flex-1">{{ lang.name }}</span>
              <span
                v-if="lang.isSource"
                class="text-[10px] font-mono tracking-mono uppercase text-primary font-medium"
                >Source</span
              >
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
</template>

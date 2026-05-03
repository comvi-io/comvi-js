<script setup lang="ts">
import { ref, computed, inject, watch } from "vue";
import type { Language, LanguageSelectConfig } from "@/types";
import { usePluralRules } from "@/composables/usePluralRules";
import { useSelectPresets } from "@/composables/useSelectPresets";
import { ChevronRight, ChevronDown, HelpCircle } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HighlightedTextarea } from "@/components/ui/highlighted-textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const props = defineProps<{
  lang: Language;
  translations: Record<string, string>;
}>();

const translationManager = inject<any>("translationManager");
const usePluralForms = computed(() => translationManager?.isPlural.value ?? false);

const selectConfig = computed<LanguageSelectConfig | undefined>(() =>
  translationManager?.getSelectConfig?.(props.lang.code),
);
const useSelectForms = computed(() => selectConfig.value?.enabled ?? false);

const { presets, getDefaultPreset, detectPresetFromForms } = useSelectPresets();
const selectedPresetId = ref<string>("formality");

const detectedPreset = computed(() => {
  if (!selectConfig.value?.enabled) return getDefaultPreset();
  return detectPresetFromForms(selectConfig.value.variable, selectConfig.value.options);
});

watch(
  detectedPreset,
  (preset) => {
    selectedPresetId.value = preset.id;
  },
  { immediate: true },
);

const customOptionInput = ref("");
const customVariable = ref("select");

const isCustomPreset = computed(() => selectedPresetId.value === "custom");

const isCollapsed = ref(false);

const pluralInfo = computed(() => usePluralRules(props.lang.code));

const emit = defineEmits<{
  (e: "update:translation", languageCode: string, pluralForm: string, value: string): void;
}>();

const handleTranslationChange = (langCodeOrValue: string, form?: string, value?: string) => {
  if (form !== undefined && value !== undefined) {
    emit("update:translation", langCodeOrValue, form, value);
  } else {
    emit("update:translation", props.lang.code, "other", langCodeOrValue);
  }
};

const isFieldDirty = (form: string): boolean => {
  return translationManager?.isFieldDirty?.(props.lang.code, form) ?? false;
};

const charCount = (form: string): number => {
  return (props.translations?.[form] || "").length;
};

const handleSelectToggle = (enabled: boolean) => {
  if (!translationManager?.toggleSelectMode) return;

  if (enabled) {
    const preset = presets.find((p) => p.id === selectedPresetId.value) || getDefaultPreset();
    translationManager.toggleSelectMode(props.lang.code, true, {
      variable: preset.variable,
      options: preset.options.map((o: { key: string }) => o.key),
    });
  } else {
    translationManager.toggleSelectMode(props.lang.code, false);
  }
};

const handlePresetChange = (presetId: string) => {
  selectedPresetId.value = presetId;
  if (!translationManager?.updateSelectConfig) return;

  const preset = presets.find((p) => p.id === presetId);
  if (preset && preset.id !== "custom") {
    translationManager.updateSelectConfig(props.lang.code, {
      variable: preset.variable,
      options: preset.options.map((o: { key: string }) => o.key),
    });
  } else if (presetId === "custom") {
    const currentOptions = selectConfig.value?.options || [];
    customVariable.value = selectConfig.value?.variable || "select";
    if (currentOptions.length === 0) {
      translationManager.updateSelectConfig(props.lang.code, {
        variable: customVariable.value,
        options: [],
      });
    }
  }
};

const addCustomOption = () => {
  if (!customOptionInput.value.trim()) return;
  if (!translationManager?.updateSelectConfig) return;

  const newOption = customOptionInput.value.trim().toLowerCase().replace(/\s+/g, "_");
  const currentOptions = selectConfig.value?.options || [];

  if (currentOptions.includes(newOption)) {
    customOptionInput.value = "";
    return;
  }

  translationManager.updateSelectConfig(props.lang.code, {
    variable: customVariable.value,
    options: [...currentOptions, newOption],
  });
  customOptionInput.value = "";
};

const removeCustomOption = (option: string) => {
  if (!translationManager?.updateSelectConfig) return;

  const currentOptions = selectConfig.value?.options || [];
  translationManager.updateSelectConfig(props.lang.code, {
    options: currentOptions.filter((o: string) => o !== option),
  });
};

const updateCustomVariable = (value: string) => {
  customVariable.value = value;
  if (!translationManager?.updateSelectConfig) return;

  translationManager.updateSelectConfig(props.lang.code, {
    variable: value,
  });
};

const selectForms = computed(() => selectConfig.value?.options || []);

const formChipClass =
  "inline-flex items-center font-mono text-[10px] tracking-mono font-medium uppercase px-2 py-0.5 border";
</script>

<template>
  <div :class="['p-4', lang.isSource ? 'bg-accent-soft/30' : '']">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 text-muted-foreground hover:text-foreground"
          :aria-expanded="!isCollapsed"
          :aria-label="isCollapsed ? `Expand ${lang.name}` : `Collapse ${lang.name}`"
          @click="isCollapsed = !isCollapsed"
        >
          <ChevronRight v-if="isCollapsed" class="h-4 w-4" />
          <ChevronDown v-else class="h-4 w-4" />
        </Button>
        <span class="font-medium">{{ lang.name }}</span>
        <Badge v-if="lang.isSource" variant="accent">Source</Badge>
      </div>
    </div>

    <div v-if="!isCollapsed">
      <!-- Variants toggle -->
      <div class="flex items-center gap-4 mb-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <Checkbox
            v-model="useSelectForms"
            @update:model-value="
              (value: boolean | 'indeterminate') => handleSelectToggle(value === true)
            "
          />
          <span class="text-sm inline-flex items-center gap-1.5">
            Add variants
            <Tooltip>
              <TooltipTrigger as-child>
                <HelpCircle class="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" class="max-w-xs">
                Create different translations based on a variable like gender or formality level.
              </TooltipContent>
            </Tooltip>
          </span>
        </label>

        <div v-if="useSelectForms" class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground">Preset:</span>
          <Select
            :model-value="selectedPresetId"
            @update:model-value="(v) => handlePresetChange(String(v))"
          >
            <SelectTrigger class="w-32 h-8">
              <SelectValue placeholder="Select preset" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="preset in presets" :key="preset.id" :value="preset.id">
                {{ preset.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <!-- Custom options UI -->
      <div v-if="useSelectForms && isCustomPreset" class="mb-4 p-3 bg-surface-2 border">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs text-muted-foreground">Variable:</span>
          <Input
            class="w-32 h-8"
            :model-value="customVariable"
            placeholder="select"
            @update:model-value="(v: string | number) => updateCustomVariable(String(v))"
          />
        </div>
        <div class="flex items-center gap-2 mb-2">
          <Input
            v-model="customOptionInput"
            class="flex-1 h-8"
            placeholder="Add option (e.g., formal, informal)"
            @keyup.enter="addCustomOption"
          />
          <Button size="sm" variant="outline" @click="addCustomOption">Add</Button>
        </div>
        <div v-if="selectForms.length > 0" class="flex flex-wrap gap-2">
          <span
            v-for="option in selectForms"
            :key="option"
            class="inline-flex items-center gap-1 px-2 py-1 border border-line-2 text-muted-foreground text-xs"
          >
            {{ option }}
            <button class="hover:text-foreground" @click="removeCustomOption(option)">×</button>
          </span>
        </div>
        <p v-else class="text-xs text-muted-foreground">No options added yet</p>
      </div>

      <!-- COMBINED: Plural + Select mode -->
      <div v-if="usePluralForms && useSelectForms" class="space-y-4">
        <div v-for="selectForm in selectForms" :key="selectForm" class="border p-3">
          <div class="mb-3">
            <span :class="[formChipClass, 'border-primary/30 bg-accent-soft text-primary']">
              {{ selectForm }}
            </span>
          </div>
          <div class="space-y-3 pl-3 border-l-2 border-l-primary/40">
            <div v-for="pluralForm in lang.pluralForms" :key="pluralForm" class="mb-2">
              <div class="mb-1 flex items-center gap-2">
                <span :class="[formChipClass, 'border-line-2 bg-surface-2 text-muted-foreground']">
                  {{ pluralForm }}
                </span>
              </div>
              <div
                :class="[
                  'transition-colors',
                  isFieldDirty(`${selectForm}:${pluralForm}`)
                    ? 'border-l-2 border-l-warn pl-2'
                    : '',
                ]"
              >
                <HighlightedTextarea
                  class="min-h-12 text-sm"
                  :locale-code="lang.code"
                  :model-value="translations?.[`${selectForm}:${pluralForm}`] || ''"
                  :placeholder="`${selectForm} + ${pluralForm}...`"
                  @update:model-value="
                    (v: string | number) =>
                      handleTranslationChange(lang.code, `${selectForm}:${pluralForm}`, String(v))
                  "
                />
                <div class="flex justify-end mt-0.5">
                  <span class="text-xs text-muted-foreground">
                    {{ charCount(`${selectForm}:${pluralForm}`) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- PLURAL ONLY mode -->
      <div v-else-if="usePluralForms">
        <div>
          <div class="space-y-4">
            <div v-for="form in lang.pluralForms" :key="form" class="mb-3">
              <div class="mb-2 flex items-center gap-2">
                <span :class="[formChipClass, 'border-line-2 bg-surface-2 text-muted-foreground']">
                  {{ form.toUpperCase() }}
                </span>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <HelpCircle
                      class="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help"
                    />
                  </TooltipTrigger>
                  <TooltipContent side="right" class="max-w-xs">
                    <div class="space-y-1.5">
                      <p class="leading-snug">
                        {{ pluralInfo.explanations[form] || "Used for specific numbers" }}
                      </p>
                      <div>
                        <span class="text-muted-foreground font-medium">Examples: </span>
                        <span>
                          {{ pluralInfo.examples[form]?.slice(0, 10).join(", ") }}
                        </span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div
                :class="[
                  'transition-colors',
                  isFieldDirty(form) ? 'border-l-2 border-l-warn pl-2' : '',
                ]"
              >
                <HighlightedTextarea
                  class="min-h-16 mb-1"
                  :locale-code="lang.code"
                  :model-value="translations?.[form] || ''"
                  :placeholder="`Enter ${lang.name} translation for ${form} form...`"
                  @update:model-value="
                    (v: string | number) => handleTranslationChange(lang.code, form, String(v))
                  "
                />
                <div class="flex justify-end">
                  <span class="text-xs text-muted-foreground">{{ charCount(form) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- SELECT ONLY mode -->
      <div v-else-if="useSelectForms" class="space-y-3">
        <div v-for="form in selectForms" :key="form" class="mb-3">
          <div class="mb-2 flex items-center gap-2">
            <span :class="[formChipClass, 'border-primary/30 bg-accent-soft text-primary']">
              {{ form }}
            </span>
          </div>
          <div
            :class="[
              'transition-colors',
              isFieldDirty(form) ? 'border-l-2 border-l-warn pl-2' : '',
            ]"
          >
            <HighlightedTextarea
              class="min-h-16 mb-1"
              :locale-code="lang.code"
              :model-value="translations?.[form] || ''"
              :placeholder="`Enter ${lang.name} translation for ${form}...`"
              @update:model-value="
                (v: string | number) => handleTranslationChange(lang.code, form, String(v))
              "
            />
            <div class="flex justify-end">
              <span class="text-xs text-muted-foreground">{{ charCount(form) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- SINGULAR mode -->
      <div v-else>
        <div
          :class="[
            'transition-colors',
            isFieldDirty('other') ? 'border-l-2 border-l-warn pl-2' : '',
          ]"
        >
          <HighlightedTextarea
            class="min-h-24 mb-1"
            :locale-code="lang.code"
            :model-value="translations?.other || ''"
            :placeholder="`Enter ${lang.name} translation...`"
            @update:model-value="(v: string | number) => handleTranslationChange(String(v))"
          />
          <div class="flex justify-end mb-3">
            <span class="text-xs text-muted-foreground">{{ charCount("other") }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

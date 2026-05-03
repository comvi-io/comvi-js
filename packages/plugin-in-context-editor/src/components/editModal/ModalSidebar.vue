<script setup lang="ts">
import { ref, inject, computed } from "vue";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Language } from "@/types";
import {
  DEFAULT_PLURAL_VARIABLE,
  PLURAL_VARIABLE_PATTERN,
  MAX_PLURAL_VARIABLE_LENGTH,
} from "@/utils/icuParser";

defineProps<{
  languages: Language[];
}>();

const translationManager = inject<any>("translationManager");

const keyDescription = computed(() => translationManager?.description.value ?? "");

const usePluralForms = computed({
  get: () => translationManager?.isPlural.value ?? false,
  set: (value: boolean) => {
    if (translationManager) {
      translationManager.togglePluralMode(value);
    }
  },
});

const variableName = computed({
  get: () => translationManager?.pluralVariable.value ?? "",
  set: (value: string) => {
    if (translationManager) {
      translationManager.updatePluralVariable(value);
    }
  },
});

const variableNameError = ref<string>("");
const hasShownError = ref<boolean>(false);

function validateVariableName(): void {
  const value = variableName.value;

  if (!value || value.trim() === "") {
    variableNameError.value = "Variable name is required";
    hasShownError.value = true;
    return;
  }

  if (value.length > MAX_PLURAL_VARIABLE_LENGTH) {
    variableNameError.value = `Variable name must be ${MAX_PLURAL_VARIABLE_LENGTH} characters or less`;
    hasShownError.value = true;
    return;
  }

  if (!PLURAL_VARIABLE_PATTERN.test(value)) {
    variableNameError.value =
      "Variable name must be a valid identifier (letters, numbers, underscore)";
    hasShownError.value = true;
    return;
  }

  variableNameError.value = "";
  hasShownError.value = false;
}
</script>

<template>
  <div class="w-64 border-r overflow-y-auto bg-surface-2/40" style="max-height: calc(90vh - 70px)">
    <div class="p-4 space-y-6">
      <div v-if="keyDescription">
        <h3 class="text-[10px] font-mono tracking-mono uppercase text-muted-foreground mb-2">
          Description
        </h3>
        <p class="text-sm text-foreground">{{ keyDescription }}</p>
      </div>

      <div>
        <h3 class="text-[10px] font-mono tracking-mono uppercase text-muted-foreground mb-2">
          Pluralization
        </h3>
        <div class="mb-3">
          <label for="use-plural-forms" class="flex items-center cursor-pointer gap-2">
            <Checkbox id="use-plural-forms" v-model="usePluralForms" />
            <span class="text-sm">Use plural forms</span>
          </label>
        </div>

        <div v-if="usePluralForms" class="space-y-4">
          <div>
            <label
              for="plural-variable-name"
              class="text-[10px] font-mono tracking-mono uppercase text-muted-foreground mb-2 block"
            >
              Variable Name
            </label>
            <Input
              id="plural-variable-name"
              v-model="variableName"
              type="text"
              :class="variableNameError ? 'border-destructive focus-visible:ring-destructive' : ''"
              :placeholder="DEFAULT_PLURAL_VARIABLE"
              :aria-invalid="!!variableNameError"
              aria-describedby="plural-variable-error"
              @blur="validateVariableName"
            />
            <p
              v-if="variableNameError"
              id="plural-variable-error"
              class="mt-1 text-xs text-destructive"
              role="alert"
            >
              {{ variableNameError }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

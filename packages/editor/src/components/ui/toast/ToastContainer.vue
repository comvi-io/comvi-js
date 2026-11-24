<script setup lang="ts">
import { inject } from "vue";
import { TOAST_INJECTION_KEY } from "@/composables/useToast";
import { X, Check, AlertCircle } from "@lucide/vue";

const toast = inject(TOAST_INJECTION_KEY);
</script>

<template>
  <div
    v-if="toast && toast.toasts.value.length > 0"
    class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
  >
    <div
      v-for="item in toast.toasts.value"
      :key="item.id"
      :class="[
        'flex items-start gap-3 p-4 bg-popover text-popover-foreground border shadow-md animate-in fade-in-0 slide-in-from-bottom-2 duration-200',
        item.variant === 'success' ? 'border-success/30' : 'border-destructive/30',
      ]"
    >
      <div
        :class="[
          'shrink-0 mt-0.5 h-5 w-5 flex items-center justify-center',
          item.variant === 'success'
            ? 'bg-success/15 text-success'
            : 'bg-destructive/15 text-destructive',
        ]"
      >
        <Check v-if="item.variant === 'success'" class="h-3 w-3" />
        <AlertCircle v-else class="h-3 w-3" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium">{{ item.title }}</p>
        <p v-if="item.description" class="text-sm text-muted-foreground mt-0.5">
          {{ item.description }}
        </p>
      </div>
      <button
        class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        @click="toast.removeToast(item.id)"
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>

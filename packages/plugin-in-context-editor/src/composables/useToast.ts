import { ref, type InjectionKey } from "vue";

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: "success" | "error";
}

let nextId = 0;

export function createToastManager() {
  const toasts = ref<ToastItem[]>([]);

  function addToast(options: Omit<ToastItem, "id">) {
    const id = nextId++;
    toasts.value.push({ ...options, id });
    setTimeout(() => removeToast(id), 3000);
  }

  function removeToast(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toasts, addToast, removeToast };
}

export type ToastManager = ReturnType<typeof createToastManager>;

export const TOAST_INJECTION_KEY: InjectionKey<ToastManager> = Symbol("toast");

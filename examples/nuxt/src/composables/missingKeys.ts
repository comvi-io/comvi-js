import { computed, shallowReactive } from "vue";

// The distinct keys found missing in this browser. In your app, send them to
// an error tracker instead.
const missed = shallowReactive(new Set<string>());

export const missingKeys = computed(() => missed.size);

export function reportMissingKey(key: string): void {
  missed.add(key);
}

/** Mounted in a shadow root so host page styles cannot reach the modal. */

import { createApp, ref, shallowRef, type App as VueApp } from "vue";
import App from "./App.vue";
import { createShadowDomContainer } from "./utils/shadowDom";
import type { Target } from "./adapter";

let container: HTMLElement | null = null;
let app: VueApp | null = null;

const isOpen = ref(false);
const currentKey = ref<string>("");
const currentNs = ref<string>("");
const currentInstanceId = ref<string | undefined>(undefined);
/** The instance a save writes back into. */
const currentTarget = shallowRef<Target | undefined>(undefined);

/**
 * Unmounts the modal. With `instanceId`, only when that instance owns it: a
 * stopping Core must not tear down the modal another active Core opened.
 */
export function cleanup(instanceId?: string) {
  if (instanceId !== undefined && currentInstanceId.value !== undefined) {
    if (currentInstanceId.value !== instanceId) return;
  }
  if (app) {
    app.unmount();
    app = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  isOpen.value = false;
  currentKey.value = "";
  currentNs.value = "";
  currentInstanceId.value = undefined;
  currentTarget.value = undefined;
}

function mountApp(key: string, ns: string, instanceId?: string, target?: Target) {
  if (container) {
    isOpen.value = true;
    currentKey.value = key;
    currentNs.value = ns;
    currentInstanceId.value = instanceId;
    currentTarget.value = target;
    return;
  }

  const { container: newContainer, mountPoint } = createShadowDomContainer();
  container = newContainer;

  isOpen.value = true;
  currentKey.value = key;
  currentNs.value = ns;
  currentInstanceId.value = instanceId;
  currentTarget.value = target;

  app = createApp(App, {
    translationKey: currentKey,
    translationNamespace: currentNs,
    translationInstanceId: currentInstanceId,
    translationTarget: currentTarget,
    open: isOpen,
    "onUpdate:open": (value: boolean) => {
      isOpen.value = value;
    },
  });
  app.mount(mountPoint);
}

export function showModal(key: string, ns: string, instanceId?: string, target?: Target) {
  if (!container) {
    mountApp(key, ns, instanceId, target);
  } else {
    isOpen.value = true;
    currentKey.value = key;
    currentNs.value = ns;
    currentInstanceId.value = instanceId;
    currentTarget.value = target;
  }
}

export function closeModal() {
  isOpen.value = false;
  // Modal is hidden but stays mounted for faster reopening
}

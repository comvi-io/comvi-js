/** Mounted in a shadow root so host page styles cannot reach the modal. */

import { createApp, ref, type App as VueApp } from "vue";
import App from "./App.vue";
import { createShadowDomContainer } from "./utils/shadowDom";

let container: HTMLElement | null = null;
let app: VueApp | null = null;

const isOpen = ref(false);
const currentKey = ref<string>("");
const currentNs = ref<string>("");
const currentInstanceId = ref<string | undefined>(undefined);

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
}

function mountApp(key: string, ns: string, instanceId?: string) {
  if (container) {
    isOpen.value = true;
    currentKey.value = key;
    currentNs.value = ns;
    currentInstanceId.value = instanceId;
    return;
  }

  const { container: newContainer, mountPoint } = createShadowDomContainer();
  container = newContainer;

  isOpen.value = true;
  currentKey.value = key;
  currentNs.value = ns;
  currentInstanceId.value = instanceId;

  app = createApp(App, {
    translationKey: currentKey,
    translationNamespace: currentNs,
    translationInstanceId: currentInstanceId,
    open: isOpen,
    "onUpdate:open": (value: boolean) => {
      isOpen.value = value;
    },
  });
  app.mount(mountPoint);
}

export function showModal(key: string, ns: string, instanceId?: string) {
  if (!container) {
    mountApp(key, ns, instanceId);
  } else {
    isOpen.value = true;
    currentKey.value = key;
    currentNs.value = ns;
    currentInstanceId.value = instanceId;
  }
}

export function closeModal() {
  isOpen.value = false;
  // Modal is hidden but stays mounted for faster reopening
}

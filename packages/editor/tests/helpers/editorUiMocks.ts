import { vi } from "vitest";

/**
 * Doubles for the two lazily loaded editor-UI chunks — the only collaborators
 * a real-pipeline suite replaces. What reaches them is what the translator
 * would see open: the modal for one key, or the selector offering several.
 *
 * Usage, which keeps the doubles initialized before the hoisted `vi.mock` runs:
 *
 *     const ui = await vi.hoisted(() => import("./helpers/editorUiMocks"));
 *     vi.mock("../src/EditModal", ui.mockEditModalModule);
 *     vi.mock("../src/KeySelector", ui.mockKeySelectorModule);
 */

export const showModalMock = vi.fn();
export const showKeySelectorMock = vi.fn();

/**
 * The import boundary of the two chunks. While held, a dynamic import of
 * either chunk stays pending, so a test can act (stop the runtime, click
 * again) BEFORE the UI resolves, then release it on purpose. A suite that
 * wants a fresh, gated import per test must `vi.resetModules()` and import
 * the Core again, since the Core caches a chunk once it has loaded.
 */
let importGate: { promise: Promise<void>; release: () => void } | null = null;

export function holdUiImports(): void {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  importGate = { promise, release };
}

export function releaseUiImports(): void {
  importGate?.release();
  importGate = null;
}

async function passImportGate(): Promise<void> {
  await importGate?.promise;
}

export async function mockEditModalModule() {
  await passImportGate();
  return {
    showModal: (...args: unknown[]) => showModalMock(...args),
    cleanup: () => undefined,
  };
}

export async function mockKeySelectorModule() {
  await passImportGate();
  return {
    showKeySelector: (...args: unknown[]) => showKeySelectorMock(...args),
    cleanup: () => undefined,
  };
}

/** One opened modal: the key, its namespace, and the runtime that opened it. */
export type OpenedModal = { key: string; ns: string; instanceId: string };

/** Every modal opened so far, oldest first. */
export function openedModals(): OpenedModal[] {
  return showModalMock.mock.calls.map(([key, ns, instanceId]) => ({
    key: key as string,
    ns: ns as string,
    instanceId: instanceId as string,
  }));
}

/** One opened key selector: the keys it offered and the element it was anchored to. */
export type OpenedSelector = {
  keyData: Array<{ key: string; ns: string; textPreview?: string }>;
  anchor: Element;
  instanceId: string | undefined;
};

/** Every key selector opened so far, oldest first. */
export function openedSelectors(): OpenedSelector[] {
  return showKeySelectorMock.mock.calls.map(([keyData, anchor, , , instanceId]) => ({
    keyData: keyData as OpenedSelector["keyData"],
    anchor: anchor as Element,
    instanceId: instanceId as string | undefined,
  }));
}

/** What the translator does in the open selector: picks one of the offered keys. */
export function chooseInSelector(index: number, key: string, ns: string): void {
  const onSelect = showKeySelectorMock.mock.calls[index]?.[2] as
    ((key: string, ns: string) => void) | undefined;
  if (!onSelect) throw new Error(`no key selector was opened at index ${index}`);
  onSelect(key, ns);
}

export function resetEditorUiMocks(): void {
  releaseUiImports();
  showModalMock.mockReset();
  showKeySelectorMock.mockReset();
}

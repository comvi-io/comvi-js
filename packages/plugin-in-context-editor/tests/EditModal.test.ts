import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createApp: vi.fn(),
  mount: vi.fn(),
  unmount: vi.fn(),
  createShadowDomContainer: vi.fn(),
}));

vi.mock("vue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue")>()),
  createApp: mocks.createApp,
}));

vi.mock("../src/utils/shadowDom", () => ({
  createShadowDomContainer: mocks.createShadowDomContainer,
}));

// The SFC tree is never the subject here — `createApp` is mocked, so `App` is
// only ever an argument. Stubbing it keeps the per-test `vi.resetModules()`
// from re-transforming ~110 modules.
vi.mock("../src/App.vue", () => ({ default: { name: "AppStub", render: () => null } }));

/** The props object `EditModal` hands to `createApp` and then keeps mutating. */
type ModalProps = {
  translationKey: { value: string };
  translationNamespace: { value: string };
  translationInstanceId: { value: string | undefined };
  open: { value: boolean };
  "onUpdate:open": (value: boolean) => void;
};

function appProps(): ModalProps {
  return mocks.createApp.mock.calls[0]![1] as ModalProps;
}

describe("EditModal", () => {
  let container: HTMLElement;
  let mountPoint: HTMLElement;
  let modal: typeof import("../src/EditModal");

  beforeEach(async () => {
    vi.resetModules();
    mocks.createApp.mockReset();
    mocks.mount.mockReset();
    mocks.unmount.mockReset();
    mocks.createShadowDomContainer.mockReset();

    container = document.createElement("div");
    mountPoint = document.createElement("div");
    mocks.createShadowDomContainer.mockReturnValue({ container, mountPoint });
    mocks.createApp.mockReturnValue({ mount: mocks.mount, unmount: mocks.unmount });

    modal = await import("../src/EditModal");
  });

  it("showModal() creates one shadow container and mounts the app into it", () => {
    modal.showModal("home.title", "default", "instance-a");

    expect(mocks.createShadowDomContainer).toHaveBeenCalledOnce();
    expect(mocks.createApp).toHaveBeenCalledOnce();
    expect(mocks.mount).toHaveBeenCalledExactlyOnceWith(mountPoint);
  });

  it("showModal() hands the key, namespace and instance id to the app and opens it", () => {
    modal.showModal("home.title", "default", "instance-a");

    const props = appProps();
    expect(props.translationKey.value).toBe("home.title");
    expect(props.translationNamespace.value).toBe("default");
    expect(props.translationInstanceId.value).toBe("instance-a");
    expect(props.open.value).toBe(true);
  });

  it("closeModal() closes the modal but keeps the app mounted", () => {
    modal.showModal("home.title", "default", "instance-a");

    modal.closeModal();

    expect(appProps().open.value).toBe(false);
    expect(mocks.unmount).not.toHaveBeenCalled();
  });

  it("a second showModal() reuses the mounted app and swaps in the new key", () => {
    modal.showModal("home.title", "default", "instance-a");
    modal.closeModal();

    modal.showModal("checkout.total", "checkout");

    expect(mocks.createApp).toHaveBeenCalledOnce();
    expect(mocks.createShadowDomContainer).toHaveBeenCalledOnce();
    const props = appProps();
    expect(props.translationKey.value).toBe("checkout.total");
    expect(props.translationNamespace.value).toBe("checkout");
    expect(props.translationInstanceId.value).toBeUndefined();
    expect(props.open.value).toBe(true);
  });

  it("the app's onUpdate:open(false) closes the modal", () => {
    modal.showModal("home.title", "default", "instance-a");
    const props = appProps();

    props["onUpdate:open"](false);

    expect(props.open.value).toBe(false);
  });

  it("cleanup() unmounts the app, removes the container and clears the props", () => {
    // Spied before the dynamic import so the spy survives `vi.resetModules()`.
    const remove = vi.spyOn(container, "remove");
    modal.showModal("home.title", "default", "instance-a");

    modal.cleanup();

    expect(mocks.unmount).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    const props = appProps();
    expect(props.translationKey.value).toBe("");
    expect(props.translationNamespace.value).toBe("");
    expect(props.translationInstanceId.value).toBeUndefined();
    expect(props.open.value).toBe(false);
  });

  it("a second cleanup() unmounts and removes nothing more", () => {
    const remove = vi.spyOn(container, "remove");
    modal.showModal("home.title", "default", "instance-a");
    modal.cleanup();

    modal.cleanup();

    expect(mocks.unmount).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
});

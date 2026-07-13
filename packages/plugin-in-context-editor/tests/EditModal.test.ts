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

describe("EditModal", () => {
  let container: HTMLElement;
  let mountPoint: HTMLElement;

  beforeEach(() => {
    vi.resetModules();
    mocks.createApp.mockReset();
    mocks.mount.mockReset();
    mocks.unmount.mockReset();
    mocks.createShadowDomContainer.mockReset();

    container = document.createElement("div");
    mountPoint = document.createElement("div");
    mocks.createShadowDomContainer.mockReturnValue({ container, mountPoint });
    mocks.createApp.mockReturnValue({ mount: mocks.mount, unmount: mocks.unmount });
  });

  it("mounts once and updates the existing modal on subsequent opens", async () => {
    const remove = vi.spyOn(container, "remove");
    const modal = await import("../src/EditModal");

    modal.showModal("home.title", "default", "instance-a");

    expect(mocks.createShadowDomContainer).toHaveBeenCalledOnce();
    expect(mocks.createApp).toHaveBeenCalledOnce();
    expect(mocks.mount).toHaveBeenCalledWith(mountPoint);

    const props = mocks.createApp.mock.calls[0]![1] as {
      translationKey: { value: string };
      translationNamespace: { value: string };
      translationInstanceId: { value: string | undefined };
      open: { value: boolean };
      "onUpdate:open": (value: boolean) => void;
    };
    expect(props.translationKey.value).toBe("home.title");
    expect(props.translationNamespace.value).toBe("default");
    expect(props.translationInstanceId.value).toBe("instance-a");
    expect(props.open.value).toBe(true);

    modal.closeModal();
    expect(props.open.value).toBe(false);

    modal.showModal("checkout.total", "checkout");
    expect(mocks.createApp).toHaveBeenCalledOnce();
    expect(props.translationKey.value).toBe("checkout.total");
    expect(props.translationNamespace.value).toBe("checkout");
    expect(props.translationInstanceId.value).toBeUndefined();
    expect(props.open.value).toBe(true);

    props["onUpdate:open"](false);
    expect(props.open.value).toBe(false);

    modal.cleanup();
    expect(mocks.unmount).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(props.translationKey.value).toBe("");
    expect(props.translationNamespace.value).toBe("");
    expect(props.translationInstanceId.value).toBeUndefined();

    modal.cleanup();
    expect(mocks.unmount).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
});

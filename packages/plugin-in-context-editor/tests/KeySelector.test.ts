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

describe("KeySelector", () => {
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
    Object.defineProperties(window, {
      innerHeight: { configurable: true, value: 800 },
      innerWidth: { configurable: true, value: 1200 },
      scrollX: { configurable: true, value: 10 },
      scrollY: { configurable: true, value: 20 },
    });
  });

  it("mounts below the element and cleans up after a selection", async () => {
    const remove = vi.spyOn(container, "remove");
    const element = document.createElement("button");
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      top: 100,
      right: 300,
      bottom: 140,
      left: 200,
      width: 100,
      height: 40,
      x: 200,
      y: 100,
      toJSON: () => ({}),
    });
    const onSelect = vi.fn();
    const selector = await import("../src/KeySelector");

    selector.showKeySelector(
      [{ key: "home.title", ns: "default", textPreview: "Home" }],
      element,
      onSelect,
      "default",
    );

    const props = mocks.createApp.mock.calls[0]![1] as {
      position: { top: number; left: number };
      open: { value: boolean };
      "onUpdate:open": (value: boolean) => void;
      onSelect: (key: string, ns: string) => void;
    };
    expect(props.position).toEqual({ top: 168, left: 210 });
    expect(props.open.value).toBe(true);
    expect(mocks.mount).toHaveBeenCalledWith(mountPoint);

    props.onSelect("home.title", "default");
    expect(onSelect).toHaveBeenCalledWith("home.title", "default");
    expect(mocks.unmount).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(props.open.value).toBe(false);

    selector.closeKeySelector();
    expect(mocks.unmount).toHaveBeenCalledOnce();
  });

  it("keeps an overflowing selector inside the viewport and cleans up when closed", async () => {
    const remove = vi.spyOn(container, "remove");
    const element = document.createElement("button");
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      top: 10,
      right: 1190,
      bottom: 790,
      left: 1100,
      width: 90,
      height: 780,
      x: 1100,
      y: 10,
      toJSON: () => ({}),
    });
    const selector = await import("../src/KeySelector");

    selector.showKeySelector([{ key: "checkout.total", ns: "checkout" }], element, vi.fn());

    const props = mocks.createApp.mock.calls[0]![1] as {
      position: { top: number; left: number };
      open: { value: boolean };
      "onUpdate:open": (value: boolean) => void;
    };
    expect(props.position).toEqual({ top: 16, left: 784 });

    props["onUpdate:open"](false);
    expect(props.open.value).toBe(false);
    expect(mocks.unmount).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
});

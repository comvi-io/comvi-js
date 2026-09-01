import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// The SFC tree is never the subject here — `createApp` is mocked, so
// `KeySelectorApp` is only ever an argument. Stubbing it keeps the per-test
// `vi.resetModules()` from re-transforming the whole component tree.
vi.mock("../src/KeySelectorApp.vue", () => ({
  default: { name: "KeySelectorAppStub", render: () => null },
}));

const VIEWPORT = { innerHeight: 800, innerWidth: 1200, scrollX: 10, scrollY: 20 };

/** The props object `KeySelector` hands to `createApp`. */
type SelectorProps = {
  keyData: Array<{ key: string; ns: string; textPreview?: string }>;
  position: { top: number; left: number };
  open: { value: boolean };
  defaultNs: string | undefined;
  "onUpdate:open": (value: boolean) => void;
  onSelect: (key: string, ns: string) => void;
};

function appProps(callIndex = 0): SelectorProps {
  return mocks.createApp.mock.calls[callIndex]![1] as SelectorProps;
}

function elementAt(rect: { top: number; bottom: number; left: number; right: number }): Element {
  const element = document.createElement("button");
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    ...rect,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
  return element;
}

describe("KeySelector", () => {
  let container: HTMLElement;
  let mountPoint: HTMLElement;
  let selector: typeof import("../src/KeySelector");
  const originalViewport = new Map<string, PropertyDescriptor | undefined>();

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

    for (const [name, value] of Object.entries(VIEWPORT)) {
      originalViewport.set(name, Object.getOwnPropertyDescriptor(window, name));
      Object.defineProperty(window, name, { configurable: true, value });
    }

    selector = await import("../src/KeySelector");
  });

  afterEach(() => {
    for (const [name, descriptor] of originalViewport) {
      if (descriptor) {
        Object.defineProperty(window, name, descriptor);
      } else {
        delete (window as unknown as Record<string, unknown>)[name];
      }
    }
    originalViewport.clear();
  });

  describe("placement", () => {
    it("opens the dropdown 8px below the element, in page coordinates", () => {
      const element = elementAt({ top: 100, right: 300, bottom: 140, left: 200 });

      selector.showKeySelector(
        [{ key: "home.title", ns: "default", textPreview: "Home" }],
        element,
        vi.fn(),
        "default",
      );

      const props = appProps();
      expect(props.position).toEqual({ top: 168, left: 210 });
      expect(props.open.value).toBe(true);
      expect(mocks.mount).toHaveBeenCalledExactlyOnceWith(mountPoint);
    });

    it("hands the key data and the default namespace to the app", () => {
      const keyData = [{ key: "home.title", ns: "default", textPreview: "Home" }];

      selector.showKeySelector(
        keyData,
        elementAt({ top: 100, right: 300, bottom: 140, left: 200 }),
        vi.fn(),
        "default",
      );

      expect(appProps().keyData).toEqual(keyData);
      expect(appProps().defaultNs).toBe("default");
    });

    it("clamps a dropdown that would overflow the viewport back inside it", () => {
      const element = elementAt({ top: 10, right: 1190, bottom: 790, left: 1100 });

      selector.showKeySelector([{ key: "checkout.total", ns: "checkout" }], element, vi.fn());

      // Flipped above (bottom 790 + 300 > 800) then floored at the 16px margin;
      // left is viewport 1200 − dropdown 400 − 16px margin.
      expect(appProps().position).toEqual({ top: 16, left: 784 });
    });

    it("flips the dropdown above the element when it would overflow the bottom edge", () => {
      const element = elementAt({ top: 400, right: 300, bottom: 600, left: 200 });

      selector.showKeySelector([{ key: "home.title", ns: "default" }], element, vi.fn());

      // Element top 400 + scroll 20 − dropdown 300 − the same 8px gap.
      expect(appProps().position).toEqual({ top: 112, left: 210 });
    });

    it("keeps the dropdown below the element when it fits the viewport exactly", () => {
      const element = elementAt({ top: 460, right: 300, bottom: 500, left: 200 });

      selector.showKeySelector([{ key: "home.title", ns: "default" }], element, vi.fn());

      expect(appProps().position).toEqual({ top: 528, left: 210 });
    });

    it("leaves the dropdown at the element when it reaches the right edge exactly", () => {
      const element = elementAt({ top: 100, right: 900, bottom: 140, left: 800 });

      selector.showKeySelector([{ key: "home.title", ns: "default" }], element, vi.fn());

      expect(appProps().position).toEqual({ top: 168, left: 810 });
    });

    it("opens with an empty key list rather than skipping the mount", () => {
      selector.showKeySelector(
        [],
        elementAt({ top: 100, right: 300, bottom: 140, left: 200 }),
        vi.fn(),
      );

      expect(appProps().keyData).toEqual([]);
      expect(mocks.mount).toHaveBeenCalledOnce();
    });
  });

  describe("teardown", () => {
    it("reports the selection to the caller and tears the dropdown down", () => {
      const remove = vi.spyOn(container, "remove");
      const onSelect = vi.fn();
      selector.showKeySelector(
        [{ key: "home.title", ns: "default", textPreview: "Home" }],
        elementAt({ top: 100, right: 300, bottom: 140, left: 200 }),
        onSelect,
        "default",
      );
      const props = appProps();

      props.onSelect("home.title", "default");

      expect(onSelect).toHaveBeenCalledExactlyOnceWith("home.title", "default");
      expect(mocks.unmount).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledOnce();
      expect(props.open.value).toBe(false);
    });

    it("closeKeySelector() after a selection unmounts nothing more", () => {
      selector.showKeySelector(
        [{ key: "home.title", ns: "default" }],
        elementAt({ top: 100, right: 300, bottom: 140, left: 200 }),
        vi.fn(),
      );
      appProps().onSelect("home.title", "default");

      selector.closeKeySelector();

      expect(mocks.unmount).toHaveBeenCalledOnce();
    });

    it("the app's onUpdate:open(false) tears the dropdown down", () => {
      const remove = vi.spyOn(container, "remove");
      selector.showKeySelector(
        [{ key: "checkout.total", ns: "checkout" }],
        elementAt({ top: 10, right: 1190, bottom: 790, left: 1100 }),
        vi.fn(),
      );
      const props = appProps();

      props["onUpdate:open"](false);

      expect(props.open.value).toBe(false);
      expect(mocks.unmount).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledOnce();
    });

    it("a second showKeySelector() tears the first dropdown down before mounting", () => {
      const element = elementAt({ top: 100, right: 300, bottom: 140, left: 200 });
      selector.showKeySelector([{ key: "home.title", ns: "default" }], element, vi.fn());

      selector.showKeySelector([{ key: "checkout.total", ns: "checkout" }], element, vi.fn());

      expect(mocks.unmount).toHaveBeenCalledOnce();
      expect(mocks.createApp).toHaveBeenCalledTimes(2);
      expect(appProps(1).keyData).toEqual([{ key: "checkout.total", ns: "checkout" }]);
    });

    it("the app's onUpdate:open(true) leaves the dropdown mounted", () => {
      const remove = vi.spyOn(container, "remove");
      selector.showKeySelector(
        [{ key: "home.title", ns: "default" }],
        elementAt({ top: 100, right: 300, bottom: 140, left: 200 }),
        vi.fn(),
      );
      const props = appProps();

      props["onUpdate:open"](true);

      expect(props.open.value).toBe(true);
      expect(mocks.unmount).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it("closeKeySelector() unmounts the dropdown and removes its container", () => {
      const remove = vi.spyOn(container, "remove");
      selector.showKeySelector(
        [{ key: "home.title", ns: "default" }],
        elementAt({ top: 100, right: 300, bottom: 140, left: 200 }),
        vi.fn(),
      );

      selector.closeKeySelector();

      expect(mocks.unmount).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledOnce();
      expect(appProps().open.value).toBe(false);
    });
  });
});

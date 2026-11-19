/**
 * Rich output marked by the editor's hook (a pair of frames around the parts) through the
 * REAL bindings — React, Vue, Solid, Svelte, from their built packages — on a real core 0.8
 * instance with `devtools()`: the marked render shows exactly the unmarked text, and an
 * Alt-click on each part opens the key of the message that part belongs to.
 *
 * Messages: `buy` "<a>Buy</a> now", `ab` "<strong>A</strong><em>B</em>", `outer` "<u>U</u>
 * <box>x</box>" whose `box` renders another `<T>` (`inner` "<i>in</i>"), `buy` and `ab`
 * side by side in one paragraph, and `joined` (plain text through `<T>`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const ui = await vi.hoisted(() => import("../helpers/editorUiMocks"));
vi.mock("../../src/EditModal", ui.mockEditModalModule);
vi.mock("../../src/KeySelector", ui.mockKeySelectorModule);

import { devtools } from "@comvi/core/devtools";
import { activate, deactivate, isActive } from "../../src/standalone";
import { decodeFrames, stripFrames } from "../../src/marker";
import { cleanupDOM } from "../helpers";
import { altClickOpens, boxAll } from "../helpers/clickProbe";

// React
import { createElement as rc, act } from "react";
import { createRoot } from "react-dom/client";
import * as R from "@comvi/react";
// Vue
import { createApp, defineComponent, h, nextTick } from "vue";
import * as V from "@comvi/vue";
// Solid
import { createComponent } from "solid-js";
import { render as solidRender } from "solid-js/web";
import * as S from "@comvi/solid";
// Svelte
import { flushSync, mount, unmount } from "svelte";
import * as Sv from "@comvi/svelte";
import Rich from "./Rich.svelte";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MESSAGES = {
  buy: "<a>Buy</a> now",
  ab: "<strong>A</strong><em>B</em>",
  outer: "<u>U</u> <box>x</box>",
  inner: "<i>in</i>",
  joined: "Plain words",
};

const IDS = ["buy", "ab", "nested", "adjacent", "joined"] as const;

interface Rendered {
  root: HTMLElement;
  /** Runs `fn` the way the framework wants a state change made (React: inside `act`). */
  run: (fn: () => void) => Promise<void>;
  end: () => void;
}

type Binding = {
  name: string;
  make: () => { t: (key: string) => unknown; destroy: () => void };
  render: (i18n: unknown, root: HTMLElement) => Promise<Rendered>;
};

const root = () => {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
};

const BINDINGS: Binding[] = [
  {
    name: "React",
    make: () => R.createI18n({ locale: "en", messages: { en: MESSAGES }, plugins: [devtools()] }),
    async render(i18n, element) {
      const tree = () =>
        rc(
          R.I18nProvider,
          { i18n: i18n as R.I18n },
          rc("p", { id: "buy" }, rc(R.T, { i18nKey: "buy", components: { a: "a" } })),
          rc(
            "p",
            { id: "ab" },
            rc(R.T, { i18nKey: "ab", components: { strong: "strong", em: "em" } }),
          ),
          rc(
            "p",
            { id: "nested" },
            rc(R.T, {
              i18nKey: "outer",
              components: {
                u: "u",
                box: () =>
                  rc(
                    "span",
                    { className: "box" },
                    rc(R.T, { i18nKey: "inner", components: { i: "i" } }),
                  ),
              },
            }),
          ),
          rc(
            "p",
            { id: "adjacent" },
            rc(R.T, { i18nKey: "buy", components: { a: "a" } }),
            rc(R.T, { i18nKey: "ab", components: { strong: "strong", em: "em" } }),
          ),
          rc("p", { id: "joined" }, rc(R.T, { i18nKey: "joined" })),
        );
      const r = createRoot(element);
      await act(async () => r.render(tree()));
      return {
        root: element,
        run: (fn) => act(async () => fn()),
        end: () => act(() => r.unmount()),
      };
    },
  },
  {
    name: "Vue",
    make: () => V.createI18n({ locale: "en", messages: { en: MESSAGES }, plugins: [devtools()] }),
    async render(i18n, element) {
      const Box = defineComponent(
        () => () =>
          h("span", { class: "box" }, [h(V.T, { i18nKey: "inner", components: { i: "i" } })]),
      );
      const app = createApp({
        render: () => [
          h("p", { id: "buy" }, [h(V.T, { i18nKey: "buy", components: { a: "a" } })]),
          h("p", { id: "ab" }, [
            h(V.T, { i18nKey: "ab", components: { strong: "strong", em: "em" } }),
          ]),
          h("p", { id: "nested" }, [
            h(V.T, { i18nKey: "outer", components: { u: "u", box: Box } }),
          ]),
          h("p", { id: "adjacent" }, [
            h(V.T, { i18nKey: "buy", components: { a: "a" } }),
            h(V.T, { i18nKey: "ab", components: { strong: "strong", em: "em" } }),
          ]),
          h("p", { id: "joined" }, [h(V.T, { i18nKey: "joined" })]),
        ],
      });
      app.use(i18n as V.VueI18n);
      app.mount(element);
      await nextTick();
      return {
        root: element,
        run: async (fn) => {
          fn();
          await nextTick();
        },
        end: () => app.unmount(),
      };
    },
  },
  {
    name: "Solid",
    make: () => S.createI18n({ locale: "en", messages: { en: MESSAGES }, plugins: [devtools()] }),
    async render(i18n, element) {
      const p = (id: string, ...children: (() => unknown)[]) => {
        const el = document.createElement("p");
        el.id = id;
        return { el, children };
      };
      const paragraphs = [
        p("buy", () => createComponent(S.T, { i18nKey: "buy", components: { a: "a" } })),
        p("ab", () =>
          createComponent(S.T, { i18nKey: "ab", components: { strong: "strong", em: "em" } }),
        ),
        p("nested", () =>
          createComponent(S.T, {
            i18nKey: "outer",
            components: {
              u: "u",
              box: () => {
                const span = document.createElement("span");
                span.className = "box";
                solidRender(
                  () => createComponent(S.T, { i18nKey: "inner", components: { i: "i" } }),
                  span,
                );
                return span;
              },
            },
          }),
        ),
        p(
          "adjacent",
          () => createComponent(S.T, { i18nKey: "buy", components: { a: "a" } }),
          () => createComponent(S.T, { i18nKey: "ab", components: { strong: "strong", em: "em" } }),
        ),
        p("joined", () => createComponent(S.T, { i18nKey: "joined" })),
      ];
      const disposers = paragraphs.map(({ el, children }) => {
        element.append(el);
        return solidRender(
          () =>
            createComponent(S.I18nProvider, {
              i18n: i18n as S.I18n,
              get children() {
                // Solid's JSX.Element covers arrays of rendered nodes.
                return children.map((c) => c()) as unknown as Element;
              },
            }),
          el,
        );
      });
      return {
        root: element,
        run: async (fn) => fn(),
        end: () => disposers.forEach((d) => d()),
      };
    },
  },
  {
    name: "Svelte",
    make: () => Sv.createI18n({ locale: "en", messages: { en: MESSAGES }, plugins: [devtools()] }),
    async render(i18n, element) {
      const component = mount(Rich, { target: element, props: { i18n: i18n as Sv.I18n } });
      flushSync();
      return {
        root: element,
        run: async (fn) => {
          fn();
          flushSync();
        },
        end: () => void unmount(component),
      };
    },
  },
];

const texts = (element: HTMLElement) =>
  Object.fromEntries(IDS.map((id) => [id, element.querySelector(`#${id}`)!.textContent]));

let current: { rendered?: Rendered; i18n?: { destroy: () => void } } = {};
afterEach(() => {
  if (isActive()) deactivate();
  current.rendered?.end();
  current.i18n?.destroy();
  current = {};
  delete (window as { __COMVI__?: unknown }).__COMVI__;
  ui.resetEditorUiMocks();
  cleanupDOM();
});

describe.each(BINDINGS)("$name", (binding) => {
  async function marked() {
    const i18n = binding.make();
    current.i18n = i18n;
    const rendered = await binding.render(i18n, root());
    current.rendered = rendered;
    const unmarked = texts(rendered.root);
    const errors = vi.spyOn(console, "error");
    const warnings = vi.spyOn(console, "warn");
    let ok = false;
    await rendered.run(() => (ok = activate({ refreshMessages: false }).ok));
    expect(ok).toBe(true);
    boxAll(rendered.root);
    return { root: rendered.root, unmarked, errors, warnings };
  }

  it("the marked render shows exactly the unmarked text, with no binding error or warning", async () => {
    const { root: r, unmarked, errors, warnings } = await marked();

    const shown = Object.fromEntries(
      Object.entries(texts(r)).map(([id, t]) => [id, stripFrames(t ?? "")]),
    );
    const frames = Object.fromEntries(
      Object.entries(texts(r)).map(([id, t]) => [
        id,
        decodeFrames(t ?? "").map((f) => (f.close ? "/" : "") + f.key),
      ]),
    );

    expect({
      unmarked,
      shown,
      frames,
      errors: errors.mock.calls,
      warnings: warnings.mock.calls.filter(([m]) => !String(m).includes("demo mode")),
    }).toEqual({
      unmarked: {
        buy: "Buy now",
        ab: "AB",
        nested: "U in",
        adjacent: "Buy nowAB",
        joined: "Plain words",
      },
      shown: unmarked,
      frames: {
        buy: ["buy", "/buy"],
        ab: ["ab", "/ab"],
        nested: ["outer", "inner", "/inner", "/outer"],
        adjacent: ["buy", "/buy", "ab", "/ab"],
        joined: ["joined"],
      },
      errors: [],
      warnings: [],
    });
  });

  it('[<a>Buy</a>, " now"] → the part and the paragraph open buy', async () => {
    const { root: r } = await marked();

    expect([
      await altClickOpens(r.querySelector("#buy a")!),
      await altClickOpens(r.querySelector("#buy")!),
    ]).toMatchObject([{ modal: "default:buy" }, { modal: "default:buy" }]);
  });

  it("[<strong>A</strong>, <em>B</em>] → each part opens ab", async () => {
    const { root: r } = await marked();

    expect([
      await altClickOpens(r.querySelector("#ab strong")!),
      await altClickOpens(r.querySelector("#ab em")!),
    ]).toMatchObject([{ modal: "default:ab" }, { modal: "default:ab" }]);
  });

  it("nested: a <T> inside a part of another → its part opens inner, the outer part opens outer", async () => {
    const { root: r } = await marked();

    expect([
      await altClickOpens(r.querySelector("#nested i")!),
      await altClickOpens(r.querySelector("#nested u")!),
    ]).toMatchObject([{ modal: "default:inner" }, { modal: "default:outer" }]);
  });

  it("adjacent: two <T> in one paragraph → each part opens its own key", async () => {
    const { root: r } = await marked();

    expect([
      await altClickOpens(r.querySelector("#adjacent a")!),
      await altClickOpens(r.querySelector("#adjacent em")!),
    ]).toMatchObject([{ modal: "default:buy" }, { modal: "default:ab" }]);
  });

  it("plain text through <T> → opens its key", async () => {
    const { root: r } = await marked();

    expect(await altClickOpens(r.querySelector("#joined")!)).toMatchObject({
      modal: "default:joined",
    });
  });

  it("deactivate → the re-render carries no frame", async () => {
    const { root: r } = await marked();

    await current.rendered!.run(() => deactivate());

    expect(r.textContent!.includes("\u{E007E}")).toBe(false);
  });
});

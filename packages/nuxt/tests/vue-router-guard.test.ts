/**
 * `i18n.load(ns)` in a REAL `vue-router` guard (vue-router is a dependency of this package's
 * tests, not of `@comvi/vue`'s). The call resolves with an `Error` where it failed and with
 * `undefined` otherwise, and the router reads what a guard returns:
 *
 * - `beforeEnter: () => i18n.load("account")` hands that value to the router: it navigates when
 *   the load succeeds; when it fails, the router receives the very `Error` (the navigation
 *   fails with it, as a guard that throws);
 * - `beforeEnter: async () => { await i18n.load("account"); }` (preload, do not block on the
 *   outcome) returns nothing: it navigates in both cases.
 *
 * Every loader answer is given by the test.
 */
import { describe, expect, it } from "vitest";
import { h } from "vue";
import { createMemoryHistory, createRouter, type NavigationGuardWithThis } from "vue-router";
import { createI18n } from "@comvi/core";

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const setup = (
  guard: (i18n: ReturnType<typeof createI18n>) => NavigationGuardWithThis<undefined>,
) => {
  const pending = new Map<string, [(c: Record<string, string>) => void, (e: unknown) => void]>();
  const i18n = createI18n({
    locale: "en",
    catalogs: { default: { en: { a: "A" } } },
    loader: (l, n) => new Promise((y, x) => pending.set(`${l}:${n}`, [y, x])),
    onError: () => {},
  });
  const Stub = { render: () => h("div") };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: Stub },
      { path: "/account", component: Stub, beforeEnter: guard(i18n) },
    ],
  });
  const errors: unknown[] = [];
  router.onError((e) => void errors.push(e));
  return { router, errors, pending };
};

const returned = (i18n: ReturnType<typeof createI18n>) => () => i18n.load("account");
const block = (i18n: ReturnType<typeof createI18n>) => async () => {
  await i18n.load("account");
};

describe("i18n.load() in a vue-router guard", () => {
  it("returned from the guard: navigates when the load succeeds", async () => {
    const { router, errors, pending } = setup(returned);
    await router.push("/");
    const nav = router.push("/account");
    await flush();
    pending.get("en:account")![0]({ b: "B" });
    expect(await nav).toBeUndefined();
    expect(router.currentRoute.value.path).toBe("/account");
    expect(errors).toEqual([]);
  });

  it("returned from the guard: when the load fails the router receives that same Error", async () => {
    const { router, errors, pending } = setup(returned);
    await router.push("/");
    const nav = router.push("/account");
    await flush();
    const e = new Error("404 account");
    pending.get("en:account")![1](e);
    await expect(nav).rejects.toBe(e);
    expect(router.currentRoute.value.path).toBe("/");
    expect(errors).toEqual([e]);
  });

  it.each([
    ["succeeds", 0],
    ["fails", 1],
  ] as const)("a block-body guard that awaits the load navigates when it %s", async (_n, x) => {
    const { router, errors, pending } = setup(block);
    await router.push("/");
    const nav = router.push("/account");
    await flush();
    const settle = pending.get("en:account")!;
    if (x) settle[1](new Error("404 account"));
    else settle[0]({ b: "B" });
    expect(await nav).toBeUndefined();
    expect(router.currentRoute.value.path).toBe("/account");
    expect(errors).toEqual([]);
  });
});

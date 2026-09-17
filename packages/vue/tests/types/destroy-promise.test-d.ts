// `destroy()` is awaitable, on the instance and on the composable's bag.
//
// The instance's `destroy()` drives `core.destroy()`, which is async, and a
// `void` return made "wait until cleanup has finished" unexpressible: an app
// tearing a host down between tests, or a request-scoped host on the server,
// had nothing to await. The type is the contract — `await i18n.destroy()` must
// compile and must not be `await undefined`.
import { createI18n, useI18n } from "../../src/index";

type Equal<X, Y> =
  (<G>() => G extends X ? 1 : 2) extends <G>() => G extends Y ? 1 : 2 ? true : false;
type Expect<X extends true> = X;

declare const i18n: ReturnType<typeof createI18n>;

export type _InstanceDestroyReturnsPromise = Expect<
  Equal<ReturnType<typeof i18n.destroy>, Promise<void>>
>;

export type _BagDestroyReturnsPromise = Expect<
  Equal<ReturnType<typeof useI18n>["destroy"], () => Promise<void>>
>;

/** The call site the change exists for. `await` on a `void` is an error here. */
export async function _awaitsTheInstance(): Promise<void> {
  await i18n.destroy();
}

export async function _awaitsTheBag(): Promise<void> {
  const bag = useI18n();
  await bag.destroy();
}

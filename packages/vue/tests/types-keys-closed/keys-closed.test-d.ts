// REGRESSION PIN: `<T>` must compile against a CLOSED key registry.
//
// Closing `TranslationKeys` narrows `tRaw`'s overloads to the registered
// literals (and `never` for the namespaced one). `<T>` resolves its key at
// RUNTIME, so it must hand core a `never`-cast key or no key-closed app can
// build. Before the fix, merely declaring the augmentation below made
// src/components/T.ts fail with:
//   TS2769: No overload matches this call.
//     Argument of type 'string' is not assignable to parameter of type 'never'.
//
// The augmentation is the whole test: this program compiles `src` with it in
// scope, so `tsc` succeeding IS the assertion. Nothing needs to be exercised.
declare module "@comvi/core" {
  interface TranslationKeys {
    "app.greeting": never;
    "app.welcome": { name: string };
  }
}

export {};

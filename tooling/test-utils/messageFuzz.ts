// The message fuzz harness, for the binding suites that compare `<T>` with
// `t()`. It lives with core's own tests — core cannot depend on this package,
// which depends on core — and is re-exported here so a binding imports it
// through node_modules, which also resolves from inside a Stryker sandbox.
export * from "../../packages/core/tests/helpers/messageFuzz";

import { describe, it, expect, vi } from "vitest";
import { I18n } from "../../src";
import type { I18nPlugin } from "../../src";

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("Plugin System", () => {
  it("executes plugins sequentially and in order", async () => {
    const executionOrder: string[] = [];
    const gate = createDeferred<void>();

    const plugin1: I18nPlugin = async () => {
      executionOrder.push("start-1");
      await gate.promise;
      executionOrder.push("end-1");
    };

    const plugin2: I18nPlugin = async () => {
      executionOrder.push("start-2");
      executionOrder.push("end-2");
    };

    const i18n = new I18n({ locale: "en" }).use(plugin1).use(plugin2);

    const initPromise = i18n.init();
    await Promise.resolve();

    expect(executionOrder).toEqual(["start-1"]);

    gate.resolve();
    await initPromise;

    expect(executionOrder).toEqual(["start-1", "end-1", "start-2", "end-2"]);
  });

  it("allows plugins to register loaders", async () => {
    const loader = vi.fn(async () => ({ loaded: "yes" }));

    const loaderPlugin: I18nPlugin = (i18n) => {
      i18n.registerLoader(loader);
    };

    const i18n = new I18n({ locale: "en", ns: [] }).use(loaderPlugin);
    await i18n.init();
    await i18n.addActiveNamespace("test");

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith("en", "test");
    expect(i18n.t("loaded", { ns: "test" })).toBe("yes");
  });

  it("runs post-processors in order and passes output along the chain", async () => {
    const addPrefix: I18nPlugin = (i18n) => {
      i18n.registerPostProcessor((val) => (typeof val === "string" ? `[prefix]${val}` : val));
    };

    const addSuffix: I18nPlugin = (i18n) => {
      i18n.registerPostProcessor((val) => (typeof val === "string" ? `${val}[suffix]` : val));
    };

    const i18n = new I18n({ locale: "en" }).use(addPrefix).use(addSuffix);
    i18n.addTranslations({ en: { test: "value" } });
    await i18n.init();

    expect(i18n.t("test")).toBe("[prefix]value[suffix]");
  });

  it("continues the post-processor chain when one throws", async () => {
    const throwingPlugin: I18nPlugin = (i18n) => {
      i18n.registerPostProcessor(() => {
        throw new Error("Processor error");
      });
    };

    const upperCasePlugin: I18nPlugin = (i18n) => {
      i18n.registerPostProcessor((val) => (typeof val === "string" ? val.toUpperCase() : val));
    };

    const i18n = new I18n({ locale: "en" }).use(throwingPlugin).use(upperCasePlugin);
    i18n.addTranslations({ en: { test: "hello" } });
    await i18n.init();

    expect(i18n.t("test")).toBe("HELLO");
  });

  it("keeps original value when a single post-processor throws", async () => {
    const i18n = new I18n({ locale: "en" });
    i18n.registerPostProcessor(() => {
      throw new Error("single processor failed");
    });
    i18n.addTranslations({ en: { test: "value" } });

    await i18n.init();

    expect(i18n.t("test")).toBe("value");
  });

  it("rejects non-function post processors", () => {
    const i18n = new I18n({ locale: "en" });

    expect(() => i18n.registerPostProcessor("invalid" as any)).toThrow(
      /registerPostProcessor\(\).*function|E_REGISTER_POST_PROCESSOR/,
    );
  });
});

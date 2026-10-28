/**
 * The `timeZone` check of a server render (design §2.6): development throws when a server
 * renders an instance with no zone, whether a component reads it through `useI18n` or only
 * through `$t`; an app in Node that never renders on a server needs none.
 *
 * Its own file, and the throwing cases last: when a setup or a render function throws in
 * development, Vue keeps that component current, and an `inject` outside any render later
 * in the same module graph would read its server context.
 */
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import { createI18n, useI18n } from "../src";

const App = defineComponent({
  setup() {
    const { t } = useI18n();
    return () => h("p", t("hi"));
  },
});
const Global = defineComponent({
  render() {
    return h("p", this.$t("hi"));
  },
});
const zoneless = () => createI18n({ locale: "en", messages: { en: { hi: "Hi" } } });

describe("timeZone of a server render", () => {
  it("an app in Node that does not render on a server needs no timeZone (a script, a test)", () => {
    const app = createSSRApp(App).use(zoneless());
    expect(app.config.globalProperties.$t("hi")).toBe("Hi");
  });

  it("a server render of an instance with no timeZone throws (development) as its first component renders", async () => {
    await expect(renderToString(createSSRApp(App).use(zoneless()))).rejects.toThrow(
      "[@comvi/vue] a server render needs the timeZone option",
    );
  });

  it("a server render that reads the instance only through $t throws too (development)", async () => {
    await expect(renderToString(createSSRApp(Global).use(zoneless()))).rejects.toThrow(
      "[@comvi/vue] a server render needs the timeZone option",
    );
  });
});

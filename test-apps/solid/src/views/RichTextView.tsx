import { createSignal, For } from "solid-js";
import { useI18n, T } from "@comvi/solid";

export default function RichTextView() {
  const { t } = useI18n();

  const [gender, setGender] = createSignal<"male" | "female" | "other">("male");
  const [formality, setFormality] = createSignal<"formal" | "informal">("formal");
  const [genderCount, setGenderCount] = createSignal(5);
  const [formalityCount, setFormalityCount] = createSignal(3);
  const [nestedCount, setNestedCount] = createSignal(3);

  return (
    <div class="space-y-8">
      <h2 class="text-2xl font-bold">{t("rich_text.title")}</h2>

      {/* HTML Interpolation */}
      <div class="space-y-2">
        <h3 class="font-semibold">HTML Tags</h3>
        <div class="p-4 bg-gray-50 rounded border">
          <T i18nKey="rich_text.bold_text" />
        </div>
      </div>

      {/* Link Interpolation with components */}
      <div class="space-y-2">
        <h3 class="font-semibold">Links (with components prop)</h3>
        <div class="p-4 bg-gray-50 rounded border">
          <T
            i18nKey="rich_text.link_text"
            components={{
              link: {
                tag: "a",
                props: {
                  href: "https://example.com",
                  class: "text-blue-600 hover:underline",
                  target: "_blank",
                },
              },
            }}
          />
        </div>
      </div>

      {/* Component Interpolation */}
      <div class="space-y-2">
        <h3 class="font-semibold">Component Interpolation using &lt;T&gt;</h3>
        <div class="p-4 bg-gray-50 rounded border">
          <T
            i18nKey="rich_text.component_interpolation"
            components={{
              placeholder: { tag: "strong", props: { class: "text-blue-600" } },
            }}
          />
        </div>
        <p class="text-sm text-gray-500 mt-2">
          Using the &lt;T&gt; component allows you to replace tags in translations with actual HTML
          elements securely.
        </p>
      </div>

      {/* Nested Tag Interpolation Section */}
      <div class="border-t pt-8 mt-8">
        <h3 class="text-xl font-bold mb-4">{t("rich_text.nested_tags_title")}</h3>

        {/* Simple Nested Tags */}
        <div class="space-y-3 mb-6">
          <h4 class="font-semibold">
            Simple Nesting: &lt;link&gt;&lt;bold&gt;text&lt;/bold&gt;&lt;/link&gt;
          </h4>
          <div class="p-4 bg-gray-50 rounded border">
            <T
              i18nKey="rich_text.nested_simple"
              components={{
                link: { tag: "a", props: { href: "#", class: "text-blue-600 hover:underline" } },
                bold: { tag: "strong", props: {} },
              }}
            />
          </div>
          <p class="text-sm text-gray-500">
            Translation:{" "}
            <code class="bg-gray-100 px-1 rounded">
              &lt;link&gt;&lt;bold&gt;this link&lt;/bold&gt;&lt;/link&gt;
            </code>{" "}
            — Uses <code class="bg-gray-100 px-1 rounded">components</code> prop for nested tags.
          </p>
        </div>

        {/* Mixed Content with Params */}
        <div class="space-y-3 mb-6">
          <h4 class="font-semibold">Mixed Content with ICU Params</h4>
          <div class="flex items-center gap-4 mb-2">
            <label class="text-sm text-gray-600">Count:</label>
            <input
              type="number"
              min="0"
              value={nestedCount()}
              onInput={(e) => setNestedCount(parseInt(e.currentTarget.value) || 0)}
              class="w-20 px-2 py-1 border rounded text-sm"
            />
          </div>
          <div class="p-4 bg-yellow-50 rounded border border-yellow-200">
            <T
              i18nKey="rich_text.nested_mixed"
              params={{ count: nestedCount() }}
              components={{
                alert: { tag: "span", props: { class: "text-yellow-800" } },
                bold: { tag: "strong", props: { class: "font-bold text-yellow-900" } },
                link: {
                  tag: "a",
                  props: { href: "#", class: "text-yellow-700 underline hover:text-yellow-900" },
                },
              }}
            />
          </div>
          <p class="text-sm text-gray-500">
            Translation:{" "}
            <code class="bg-gray-100 px-1 rounded">
              &lt;alert&gt;Warning: &lt;bold&gt;&#123;count&#125;&lt;/bold&gt;
              items...&lt;/alert&gt;
            </code>
          </p>
        </div>

        {/* Deep Nesting (3+ levels) */}
        <div class="space-y-3 mb-6">
          <h4 class="font-semibold">Deep Nesting (3+ levels)</h4>
          <div class="p-4 bg-blue-50 rounded border border-blue-200">
            <T
              i18nKey="rich_text.nested_deep"
              components={{
                card: { tag: "div", props: { class: "bg-white rounded-lg shadow p-4" } },
                header: {
                  tag: "div",
                  props: { class: "flex items-center gap-2 font-bold text-blue-900 mb-2" },
                },
                icon: { tag: "span", props: { class: "text-blue-500" } },
                content: { tag: "div", props: { class: "text-blue-800" } },
                link: { tag: "a", props: { href: "#", class: "text-blue-600 hover:underline" } },
              }}
            />
          </div>
          <p class="text-sm text-gray-500">
            Translation:{" "}
            <code class="bg-gray-100 px-1 rounded">
              &lt;card&gt;&lt;header&gt;&lt;icon/&gt;Title&lt;/header&gt;&lt;content&gt;...&lt;/content&gt;&lt;/card&gt;
            </code>{" "}
            — Uses nested HTML elements for complex layouts.
          </p>
        </div>
      </div>

      {/* ICU Select Section */}
      <div class="border-t pt-8 mt-8">
        <h3 class="text-xl font-bold mb-4">{t("rich_text.select_title")}</h3>
        <p class="text-gray-600 mb-6">{t("rich_text.select_intro")}</p>

        {/* Gender Select Example */}
        <div class="space-y-3 mb-6">
          <h4 class="font-semibold">Gender Select</h4>
          <div class="flex items-center gap-4">
            <div class="flex gap-2">
              <For each={["male", "female", "other"] as const}>
                {(g) => (
                  <button
                    onClick={() => setGender(g)}
                    class={`px-3 py-1 rounded text-sm transition-colors ${
                      gender() === g ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"
                    }`}
                  >
                    {g}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="p-4 bg-gray-50 rounded border">
            {t("rich_text.user_action", { gender: gender() })}
          </div>
        </div>

        {/* Formality Select Example */}
        <div class="space-y-3 mb-6">
          <h4 class="font-semibold">Formality Select</h4>
          <div class="flex items-center gap-4">
            <div class="flex gap-2">
              <For each={["formal", "informal"] as const}>
                {(f) => (
                  <button
                    onClick={() => setFormality(f)}
                    class={`px-3 py-1 rounded text-sm transition-colors ${
                      formality() === f ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"
                    }`}
                  >
                    {f}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="p-4 bg-gray-50 rounded border">
            {t("rich_text.greeting_formal", { formality: formality() })}
          </div>
        </div>
      </div>

      {/* Combined Select + Plural Section */}
      <div class="border-t pt-8 mt-8">
        <h3 class="text-xl font-bold mb-4">{t("rich_text.combined_title")}</h3>

        {/* Gender + Plural Example */}
        <div class="space-y-3 mb-6">
          <h4 class="font-semibold">Gender + Message Count</h4>
          <div class="flex items-center gap-4 flex-wrap">
            <div class="flex gap-2">
              <For each={["male", "female", "other"] as const}>
                {(g) => (
                  <button
                    onClick={() => setGender(g)}
                    class={`px-3 py-1 rounded text-sm transition-colors ${
                      gender() === g ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"
                    }`}
                  >
                    {g}
                  </button>
                )}
              </For>
            </div>
            <label class="flex items-center gap-2 text-sm text-gray-600">
              Count:
              <input
                type="number"
                min="0"
                value={genderCount()}
                onInput={(e) => setGenderCount(parseInt(e.currentTarget.value) || 0)}
                class="w-20 px-2 py-1 border rounded text-sm"
              />
            </label>
          </div>
          <div class="p-4 bg-gray-50 rounded border">
            {t("rich_text.user_messages", { gender: gender(), count: genderCount() })}
          </div>
        </div>

        {/* Formality + Plural Example */}
        <div class="space-y-3 mb-6">
          <h4 class="font-semibold">Formality + Notification Count</h4>
          <div class="flex items-center gap-4 flex-wrap">
            <div class="flex gap-2">
              <For each={["formal", "informal"] as const}>
                {(f) => (
                  <button
                    onClick={() => setFormality(f)}
                    class={`px-3 py-1 rounded text-sm transition-colors ${
                      formality() === f ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"
                    }`}
                  >
                    {f}
                  </button>
                )}
              </For>
            </div>
            <label class="flex items-center gap-2 text-sm text-gray-600">
              Count:
              <input
                type="number"
                min="0"
                value={formalityCount()}
                onInput={(e) => setFormalityCount(parseInt(e.currentTarget.value) || 0)}
                class="w-20 px-2 py-1 border rounded text-sm"
              />
            </label>
          </div>
          <div class="p-4 bg-gray-50 rounded border">
            {t("rich_text.new_notifications", {
              formality: formality(),
              count: formalityCount(),
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

<script setup lang="ts">
import { useI18n, useLocaleHead } from "#imports";
import { defineComponent, h, ref } from "vue";

const { t } = useI18n();

// ICU Select examples state
const gender = ref<"male" | "female" | "other">("male");
const formality = ref<"formal" | "informal">("formal");
const genderCount = ref(5);
const formalityCount = ref(3);

// Nested tags example state
const nestedCount = ref(3);

const CardWrapper = defineComponent({
  name: "CardWrapper",
  setup(_, { slots }) {
    return () =>
      h(
        "div",
        { class: "rounded-lg border border-blue-300 bg-white p-3 shadow-sm" },
        slots.default?.(),
      );
  },
});

const HeaderWrapper = defineComponent({
  name: "HeaderWrapper",
  setup(_, { slots }) {
    return () =>
      h(
        "div",
        { class: "mb-2 flex items-center gap-2 font-semibold text-blue-900" },
        slots.default?.(),
      );
  },
});

const InfoIcon = defineComponent({
  name: "InfoIcon",
  setup() {
    return () => h("span", { class: "inline-flex text-blue-600", "aria-hidden": "true" }, "ℹ️");
  },
});

const ContentWrapper = defineComponent({
  name: "ContentWrapper",
  setup(_, { slots }) {
    return () => h("div", { class: "text-sm text-blue-900/90" }, slots.default?.());
  },
});

useLocaleHead({
  baseUrl: "https://example.com",
});
</script>

<template>
  <div class="space-y-8">
    <h2 class="text-2xl font-bold">
      {{ t("rich_text.title") }}
    </h2>

    <!-- HTML Interpolation -->
    <div class="space-y-2">
      <h3 class="font-semibold">HTML Tags</h3>
      <p class="p-4 bg-gray-50 rounded border">
        <T i18n-key="rich_text.bold_text" />
      </p>
    </div>

    <!-- Link Interpolation -->
    <div class="space-y-2">
      <h3 class="font-semibold">Links</h3>
      <p class="p-4 bg-gray-50 rounded border">
        <T i18n-key="rich_text.link_text">
          <template #link="{ children }">
            <a href="https://example.com" class="text-blue-600 hover:underline" target="_blank">
              {{ children }}
            </a>
          </template>
        </T>
      </p>
    </div>

    <!-- Component Interpolation -->
    <div class="space-y-2">
      <h3 class="font-semibold">Component Interpolation using &lt;T&gt;</h3>
      <div class="p-4 bg-gray-50 rounded border">
        <T i18n-key="rich_text.component_interpolation">
          <template #placeholder="{ children }">
            <BoldComponent>{{ children }}</BoldComponent>
          </template>
        </T>
      </div>
      <p class="text-sm text-gray-500 mt-2">
        Using the &lt;T&gt; component allows you to replace tags in translations with actual Vue
        components securely.
      </p>
    </div>

    <!-- Nested Tag Interpolation Section -->
    <div class="border-t pt-8 mt-8">
      <h3 class="text-xl font-bold mb-4">
        {{ t("rich_text.nested_tags_title") }}
      </h3>

      <!-- Simple Nested Tags -->
      <div class="space-y-3 mb-6">
        <h4 class="font-semibold">
          Simple Nesting: &lt;link&gt;&lt;bold&gt;text&lt;/bold&gt;&lt;/link&gt;
        </h4>
        <div class="p-4 bg-gray-50 rounded border">
          <T
            i18n-key="rich_text.nested_simple"
            :components="{
              link: {
                component: 'a',
                props: { href: '#', class: 'text-blue-600 hover:underline' },
              },
              bold: 'strong',
            }"
          />
        </div>
        <p class="text-sm text-gray-500">
          Translation:
          <code class="bg-gray-100 px-1 rounded"
            >&lt;link&gt;&lt;bold&gt;this link&lt;/bold&gt;&lt;/link&gt;</code
          >
          - Uses <code class="bg-gray-100 px-1 rounded">:components</code> prop for nested tags.
        </p>
      </div>

      <!-- Mixed Content with Params -->
      <div class="space-y-3 mb-6">
        <h4 class="font-semibold">Mixed Content with ICU Params</h4>
        <div class="flex items-center gap-4 mb-2">
          <label class="text-sm text-gray-600">Count:</label>
          <input
            v-model.number="nestedCount"
            type="number"
            min="0"
            class="w-20 px-2 py-1 border rounded text-sm"
          />
        </div>
        <div class="p-4 bg-yellow-50 rounded border border-yellow-200">
          <T
            i18n-key="rich_text.nested_mixed"
            :params="{ count: nestedCount }"
            :components="{
              alert: { component: 'span', props: { class: 'text-yellow-800' } },
              bold: { component: 'strong', props: { class: 'font-bold text-yellow-900' } },
              link: {
                component: 'a',
                props: { href: '#', class: 'text-yellow-700 underline hover:text-yellow-900' },
              },
            }"
          />
        </div>
        <p class="text-sm text-gray-500">
          Translation:
          <code class="bg-gray-100 px-1 rounded"
            >&lt;alert&gt;Warning: &lt;bold&gt;{count}&lt;/bold&gt; items...&lt;/alert&gt;</code
          >
        </p>
      </div>

      <!-- Deep Nesting (3+ levels) -->
      <div class="space-y-3 mb-6">
        <h4 class="font-semibold">Deep Nesting (3+ levels)</h4>
        <div class="p-4 bg-blue-50 rounded border border-blue-200">
          <T
            i18n-key="rich_text.nested_deep"
            :components="{
              card: CardWrapper,
              header: HeaderWrapper,
              icon: InfoIcon,
              content: ContentWrapper,
              link: {
                component: 'a',
                props: { href: '#', class: 'text-blue-600 hover:underline' },
              },
            }"
          />
        </div>
        <p class="text-sm text-gray-500">
          Translation:
          <code class="bg-gray-100 px-1 rounded"
            >&lt;card&gt;&lt;header&gt;&lt;icon/&gt;Title&lt;/header&gt;&lt;content&gt;...&lt;/content&gt;&lt;/card&gt;</code
          >
          - Uses Vue components with
          <code class="bg-gray-100 px-1 rounded">&lt;slot /&gt;</code> for VNode children.
        </p>
      </div>
    </div>

    <!-- ICU Select Section -->
    <div class="border-t pt-8 mt-8">
      <h3 class="text-xl font-bold mb-4">
        {{ t("rich_text.select_title") }}
      </h3>
      <p class="text-gray-600 mb-6">
        {{ t("rich_text.select_intro") }}
      </p>

      <!-- Gender Select Example -->
      <div class="space-y-3 mb-6">
        <h4 class="font-semibold">Gender Select</h4>
        <div class="flex items-center gap-4">
          <div class="flex gap-2">
            <button
              v-for="g in ['male', 'female', 'other'] as const"
              :key="g"
              :class="[
                'px-3 py-1 rounded text-sm transition-colors',
                gender === g ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300',
              ]"
              @click="gender = g"
            >
              {{ g }}
            </button>
          </div>
        </div>
        <div class="p-4 bg-gray-50 rounded border">
          {{ t("rich_text.user_action", { gender }) }}
        </div>
      </div>

      <!-- Formality Select Example -->
      <div class="space-y-3 mb-6">
        <h4 class="font-semibold">Formality Select</h4>
        <div class="flex items-center gap-4">
          <div class="flex gap-2">
            <button
              v-for="f in ['formal', 'informal'] as const"
              :key="f"
              :class="[
                'px-3 py-1 rounded text-sm transition-colors',
                formality === f ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300',
              ]"
              @click="formality = f"
            >
              {{ f }}
            </button>
          </div>
        </div>
        <div class="p-4 bg-gray-50 rounded border">
          {{ t("rich_text.greeting_formal", { formality }) }}
        </div>
        <p class="text-sm text-gray-500">
          Switch to German (Sie/Du), French (vous/tu), or Spanish (usted/tu) to see the difference.
          English has no grammatical formality.
        </p>
      </div>
    </div>

    <!-- Combined Select + Plural Section -->
    <div class="border-t pt-8 mt-8">
      <h3 class="text-xl font-bold mb-4">
        {{ t("rich_text.combined_title") }}
      </h3>

      <!-- Gender + Plural Example -->
      <div class="space-y-3 mb-6">
        <h4 class="font-semibold">Gender + Message Count</h4>
        <div class="flex items-center gap-4 flex-wrap">
          <div class="flex gap-2">
            <button
              v-for="g in ['male', 'female', 'other'] as const"
              :key="g"
              :class="[
                'px-3 py-1 rounded text-sm transition-colors',
                gender === g ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300',
              ]"
              @click="gender = g"
            >
              {{ g }}
            </button>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-600">Count:</label>
            <input
              v-model.number="genderCount"
              type="number"
              min="0"
              class="w-20 px-2 py-1 border rounded text-sm"
            />
          </div>
        </div>
        <div class="p-4 bg-gray-50 rounded border">
          {{ t("rich_text.user_messages", { gender, count: genderCount }) }}
        </div>
      </div>

      <!-- Formality + Plural Example -->
      <div class="space-y-3 mb-6">
        <h4 class="font-semibold">Formality + Notification Count</h4>
        <div class="flex items-center gap-4 flex-wrap">
          <div class="flex gap-2">
            <button
              v-for="f in ['formal', 'informal'] as const"
              :key="f"
              :class="[
                'px-3 py-1 rounded text-sm transition-colors',
                formality === f ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300',
              ]"
              @click="formality = f"
            >
              {{ f }}
            </button>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-600">Count:</label>
            <input
              v-model.number="formalityCount"
              type="number"
              min="0"
              class="w-20 px-2 py-1 border rounded text-sm"
            />
          </div>
        </div>
        <div class="p-4 bg-gray-50 rounded border">
          {{ t("rich_text.new_notifications", { formality, count: formalityCount }) }}
        </div>
        <p class="text-sm text-gray-500">
          Switch to German, French, or Spanish to see formality differences.
        </p>
      </div>
    </div>
  </div>
</template>

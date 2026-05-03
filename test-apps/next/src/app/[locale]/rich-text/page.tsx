"use client";

import { useState } from "react";
import { useI18n, T } from "@comvi/next/client";
import { BoldComponent } from "../../../components/BoldComponent";
import { CardWrapper } from "../../../components/CardWrapper";
import { HeaderWrapper } from "../../../components/HeaderWrapper";
import { ContentWrapper } from "../../../components/ContentWrapper";
import { InfoIcon } from "../../../components/InfoIcon";

export default function RichTextPage() {
  const { t } = useI18n();

  // ICU Select examples state
  const [gender, setGender] = useState<"male" | "female" | "other">("male");
  const [formality, setFormality] = useState<"formal" | "informal">("formal");
  const [genderCount, setGenderCount] = useState(5);
  const [formalityCount, setFormalityCount] = useState(3);

  // Nested tags example state
  const [nestedCount, setNestedCount] = useState(3);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">{t("rich_text.title")}</h2>

      {/* HTML Interpolation */}
      <div className="space-y-2">
        <h3 className="font-semibold">HTML Tags</h3>
        <div className="p-4 bg-gray-50 rounded border">
          <T i18nKey="rich_text.bold_text" />
        </div>
      </div>

      {/* Link Interpolation */}
      <div className="space-y-2">
        <h3 className="font-semibold">Links</h3>
        <div className="p-4 bg-gray-50 rounded border">
          <T
            i18nKey="rich_text.link_text"
            components={{
              link: ({ children }) => (
                <a
                  href="https://example.com"
                  className="text-blue-600 hover:underline"
                  target="_blank"
                >
                  {children}
                </a>
              ),
            }}
          />
        </div>
      </div>

      {/* Component Interpolation */}
      <div className="space-y-2">
        <h3 className="font-semibold">Component Interpolation using &lt;T&gt;</h3>
        <div className="p-4 bg-gray-50 rounded border">
          <T
            i18nKey="rich_text.component_interpolation"
            components={{
              placeholder: ({ children }) => <BoldComponent>{children}</BoldComponent>,
            }}
          />
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Using the &lt;T&gt; component allows you to replace tags in translations with actual React
          components securely.
        </p>
      </div>

      {/* Nested Tag Interpolation Section */}
      <div className="border-t pt-8 mt-8">
        <h3 className="text-xl font-bold mb-4">{t("rich_text.nested_tags_title")}</h3>

        {/* Simple Nested Tags */}
        <div className="space-y-3 mb-6">
          <h4 className="font-semibold">
            Simple Nesting: &lt;link&gt;&lt;bold&gt;text&lt;/bold&gt;&lt;/link&gt;
          </h4>
          <div className="p-4 bg-gray-50 rounded border">
            <T
              i18nKey="rich_text.nested_simple"
              components={{
                link: <a href="#" className="text-blue-600 hover:underline" />,
                bold: <strong />,
              }}
            />
          </div>
          <p className="text-sm text-gray-500">
            Translation:{" "}
            <code className="bg-gray-100 px-1 rounded">
              &lt;link&gt;&lt;bold&gt;this link&lt;/bold&gt;&lt;/link&gt;
            </code>
            — Uses <code className="bg-gray-100 px-1 rounded">components</code> prop for nested
            tags.
          </p>
        </div>

        {/* Mixed Content with Params */}
        <div className="space-y-3 mb-6">
          <h4 className="font-semibold">Mixed Content with ICU Params</h4>
          <div className="flex items-center gap-4 mb-2">
            <label className="text-sm text-gray-600">Count:</label>
            <input
              type="number"
              min={0}
              value={nestedCount}
              onChange={(e) => setNestedCount(Number(e.target.value))}
              className="w-20 px-2 py-1 border rounded text-sm"
            />
          </div>
          <div className="p-4 bg-yellow-50 rounded border border-yellow-200">
            <T
              i18nKey="rich_text.nested_mixed"
              params={{ count: nestedCount }}
              components={{
                alert: <span className="text-yellow-800" />,
                bold: <strong className="font-bold text-yellow-900" />,
                link: <a href="#" className="text-yellow-700 underline hover:text-yellow-900" />,
              }}
            />
          </div>
          <p className="text-sm text-gray-500">
            Translation:{" "}
            <code className="bg-gray-100 px-1 rounded">
              &lt;alert&gt;Warning: &lt;bold&gt;&#123;count&#125;&lt;/bold&gt;
              items...&lt;/alert&gt;
            </code>
          </p>
        </div>

        {/* Deep Nesting (3+ levels) */}
        <div className="space-y-3 mb-6">
          <h4 className="font-semibold">Deep Nesting (3+ levels)</h4>
          <div className="p-4 bg-blue-50 rounded border border-blue-200">
            <T
              i18nKey="rich_text.nested_deep"
              components={{
                card: ({ children }) => <CardWrapper>{children}</CardWrapper>,
                header: ({ children }) => <HeaderWrapper>{children}</HeaderWrapper>,
                icon: () => <InfoIcon />,
                content: ({ children }) => <ContentWrapper>{children}</ContentWrapper>,
                link: <a href="#" className="text-blue-600 hover:underline" />,
              }}
            />
          </div>
          <p className="text-sm text-gray-500">
            Translation:{" "}
            <code className="bg-gray-100 px-1 rounded">
              &lt;card&gt;&lt;header&gt;&lt;icon/&gt;Title&lt;/header&gt;&lt;content&gt;...&lt;/content&gt;&lt;/card&gt;
            </code>
            — Uses React components with <code className="bg-gray-100 px-1 rounded">children</code>{" "}
            prop for nested rendering.
          </p>
        </div>
      </div>

      {/* ICU Select Section */}
      <div className="border-t pt-8 mt-8">
        <h3 className="text-xl font-bold mb-4">{t("rich_text.select_title")}</h3>
        <p className="text-gray-600 mb-6">{t("rich_text.select_intro")}</p>

        {/* Gender Select Example */}
        <div className="space-y-3 mb-6">
          <h4 className="font-semibold">Gender Select</h4>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {(["male", "female", "other"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    gender === g ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded border">
            {t("rich_text.user_action", { gender })}
          </div>
        </div>

        {/* Formality Select Example */}
        <div className="space-y-3 mb-6">
          <h4 className="font-semibold">Formality Select</h4>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {(["formal", "informal"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormality(f)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    formality === f ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded border">
            {t("rich_text.greeting_formal", { formality })}
          </div>
          <p className="text-sm text-gray-500">
            Switch to German (Sie/Du), French (vous/tu), or Spanish (usted/tú) to see the
            difference. English has no grammatical formality.
          </p>
        </div>
      </div>

      {/* Combined Select + Plural Section */}
      <div className="border-t pt-8 mt-8">
        <h3 className="text-xl font-bold mb-4">{t("rich_text.combined_title")}</h3>

        {/* Gender + Plural Example */}
        <div className="space-y-3 mb-6">
          <h4 className="font-semibold">Gender + Message Count</h4>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex gap-2">
              {(["male", "female", "other"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    gender === g ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Count:</label>
              <input
                type="number"
                min={0}
                value={genderCount}
                onChange={(e) => setGenderCount(Number(e.target.value))}
                className="w-20 px-2 py-1 border rounded text-sm"
              />
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded border">
            {t("rich_text.user_messages", { gender, count: genderCount })}
          </div>
        </div>

        {/* Formality + Plural Example */}
        <div className="space-y-3 mb-6">
          <h4 className="font-semibold">Formality + Notification Count</h4>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex gap-2">
              {(["formal", "informal"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormality(f)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    formality === f ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Count:</label>
              <input
                type="number"
                min={0}
                value={formalityCount}
                onChange={(e) => setFormalityCount(Number(e.target.value))}
                className="w-20 px-2 py-1 border rounded text-sm"
              />
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded border">
            {t("rich_text.new_notifications", { formality, count: formalityCount })}
          </div>
          <p className="text-sm text-gray-500">
            Switch to German, French, or Spanish to see formality differences.
          </p>
        </div>
      </div>
    </div>
  );
}

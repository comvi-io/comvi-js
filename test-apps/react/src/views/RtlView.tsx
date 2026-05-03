import { useI18n } from "@comvi/react";

export function RtlView() {
  const { t, locale } = useI18n();
  const isRtl = locale === "ar";

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t("nav.rtl")}</h2>

      <div
        className={`p-6 border rounded-lg ${isRtl ? "bg-amber-50 border-amber-200" : "bg-gray-50"}`}
      >
        <div className="flex gap-4 items-start">
          <div className="text-4xl">{isRtl ? "←" : "→"}</div>
          <div>
            <h3 className="font-bold text-lg mb-2">
              {isRtl ? "RTL Mode Active (Arabic)" : "LTR Mode Active"}
            </h3>
            <p>{t("home.intro", { name: "User" })}</p>
            <p className="mt-2 text-sm opacity-75">
              Switch language to Arabic/English to see the layout flip.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-white border shadow-sm">Item 1 (Start)</div>
        <div className="p-4 bg-white border shadow-sm">Item 2 (End)</div>
      </div>
    </div>
  );
}

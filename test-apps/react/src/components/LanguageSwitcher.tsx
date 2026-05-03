import { useI18n } from "@comvi/react";

const locales = ["en", "de", "fr", "es", "uk", "ar"];

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value)}
      className="border border-gray-300 rounded px-2 py-1 bg-white text-gray-700"
    >
      {locales.map((loc) => (
        <option key={loc} value={loc}>
          {loc.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

"use client";

import { useI18n } from "@comvi/next/client";
import { useLocalizedRouter, usePathname } from "@comvi/next/navigation";

const locales = ["en", "de", "fr", "es", "uk", "ar"];

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const router = useLocalizedRouter();
  const pathname = usePathname();

  const handleChange = async (newLocale: string) => {
    await setLocale(newLocale);
    router.push(pathname || "/", newLocale);
  };

  return (
    <select
      value={locale}
      onChange={(e) => handleChange(e.target.value)}
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

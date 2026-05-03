import { For } from "solid-js";
import { useI18n } from "@comvi/solid";

const locales = ["en", "de", "fr", "es", "uk", "ar"];

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    setLocale(target.value);
  }

  return (
    <select
      value={locale()}
      onChange={handleChange}
      class="border border-gray-300 rounded px-2 py-1 bg-white text-gray-700"
    >
      <For each={locales}>{(loc) => <option value={loc}>{loc.toUpperCase()}</option>}</For>
    </select>
  );
}

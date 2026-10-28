// The 0.8 core with every subpath an app may import: `cdn()` (`/cdn`), `detect()` and
// `persist()` (`/plugins`), the formatters (`/format`) and `devtools()` (`/devtools`). The
// runner asserts the four subpath modules are IN the graph (the positive half of
// core-default's absences). Nothing is fetched: the loader is constructed, never called.
import { createI18n } from "@comvi/core";
import { cdn } from "@comvi/core/cdn";
import { devtools } from "@comvi/core/devtools";
import { formatCurrency, formatNumber } from "@comvi/core/format";
import { detect, persist } from "@comvi/core/plugins";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

const i18n = createI18n({
  locale: "de",
  messages: { de: { hi: "Hallo {name}" } },
  plugins: [detect({ supported: ["de", "en"] }), persist(), devtools()],
});
assertEqual(typeof cdn("https://cdn.example/d1"), "function", "cdn() builds a loader");
assertEqual(i18n.t("hi", { name: "Ann" }), "Hallo Ann", "t() with a parameter");
assertEqual(formatNumber(i18n, 1234.5), "1.234,5", "formatNumber in the instance locale");
assertEqual(
  formatCurrency(i18n, 9.5, "EUR").replace(/[\u00a0\u202f]/g, " "),
  "9,50 €",
  "formatCurrency in the instance locale",
);
i18n.destroy();

console.log("BUNDLER_MATRIX_OK core-subpaths");

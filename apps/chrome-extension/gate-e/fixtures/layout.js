// Marker layout cases (map D5 owes a measurement of width and wrapping in a browser). Every case renders the SAME message twice, side by side in identically styled
// boxes: `t(key, { markers: false })` (never marked) and `t(key)` (marked once the editor is
// active). The gate measures both in real Chromium.
import { createI18n } from "/core/comvi-core.js";
import { devtools } from "/core/comvi-core-devtools.js";

/** key → [message, box class]. */
export const CASES = {
  latin: [
    "The quick brown fox jumps over the lazy dog while the editor watches every word on this line.",
    "box",
  ],
  // Thai ends in ZWSP, Persian in ZWNJ: the strings the old marker made unclickable.
  thai: ["สวัสดีครับ ยินดีต้อนรับสู่เว็บไซต์ของเราในวันนี้​", "box"],
  persian: ["می‌خواهم این متن را در صفحه ببینم‌", "box"],
  arabic: ["مرحبا بكم في موقعنا الجديد", "box"],
  arabicWide: ["مرحبا بكم في موقعنا الجديد", "box wide"],
  // Two messages joined in one text node (how Vue and Svelte join strings): the first ends in
  // a dual-joining letter, the second starts with one, so the frame between them sits inside
  // a joined word. Rendered as t("arabicA") + t("arabicB").
  arabicJoin: ["", "box wide"],
  arabicA: ["كتب", null],
  arabicB: ["بيت", null],
  ellipsis: ["A long single line that cannot fit into its narrow box at all", "box ellipsis"],
  rich: ["Read the <b>terms and conditions</b> carefully before you continue reading", "box"],
  // A suffix frame right after an emoji, and after a tag-sequence flag (England: U+1F3F4, tag
  // characters, U+E007F CANCEL TAG): the frame must not join an emoji sequence on screen.
  emoji: ["Saved \u{1F389}", "box"],
  flag: ["Go \u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", "box"],
};

const bold = (chunks) => {
  const b = document.createElement("b");
  b.append(...chunks);
  return b;
};

const i18n = createI18n({
  locale: "en",
  messages: { en: Object.fromEntries(Object.entries(CASES).map(([k, [m]]) => [k, m])) },
  plugins: [devtools()],
});

const cases = document.getElementById("cases");
const boxes = [];
for (const [key, [, cls]] of Object.entries(CASES)) {
  if (!cls) continue;
  const row = document.createElement("div");
  row.className = "case";
  row.dataset.case = key;
  for (const variant of ["plain", "marked"]) {
    const box = document.createElement("span");
    box.className = cls;
    box.dataset.variant = variant;
    if (/^(arabic|persian)/.test(key)) box.dir = "rtl";
    box.lang = { thai: "th", persian: "fa" }[key] ?? (key.startsWith("arabic") ? "ar" : "en");
    row.append(box);
    boxes.push({ box, key, variant });
  }
  cases.append(row);
}

function render() {
  for (const { box, key, variant } of boxes) {
    const params = variant === "plain" ? { markers: false } : {};
    if (key === "rich") params.b = bold;
    const out =
      key === "arabicJoin"
        ? i18n.t("arabicA", params) + i18n.t("arabicB", params)
        : i18n.t(key, params);
    box.replaceChildren(...(Array.isArray(out) ? out : [out]));
  }
}
i18n.on(render);
render();
document.body.dataset.booted = "true";

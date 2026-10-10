<!-- The module writes <html lang dir> itself; add `useLocaleHead()` here for
     canonical and hreflang links. -->
<template>
  <NuxtPage />
</template>

<style>
:root {
  color-scheme: light dark;
  --bg: #fcfcfb;
  --fg: #16181d;
  --muted: #5f6672;
  --line: #e6e8ec;
  --accent: #b45309;
  --card: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1115;
    --fg: #eceef2;
    --muted: #9aa3b2;
    --line: #262a33;
    --card: #161920;
  }
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font:
    16px/1.5 system-ui,
    -apple-system,
    "Segoe UI",
    Roboto,
    sans-serif;
}
main {
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 20px;
}
p {
  margin: 0;
}
a {
  color: var(--accent);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.85em;
}
button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}

/* header */
.hero {
  display: grid;
  gap: 12px;
  margin-block-end: 28px;
}
h1 {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  margin: 0;
}
.intro {
  color: var(--muted);
}
.switcher {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.switcher-label {
  font-size: 14px;
  color: var(--muted);
}
.segmented {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  background: var(--card);
}
.segmented button {
  border: 0;
  background: transparent;
  padding: 8px 14px;
  font-size: 14px;
}
.segmented button + button {
  border-inline-start: 1px solid var(--line);
}
.segmented button[aria-pressed="true"] {
  background: var(--accent);
  color: #fff;
}
.switcher-note {
  font-size: 14px;
  color: var(--muted);
}
.options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--card);
  padding: 4px 12px;
  font-size: 14px;
}
.chip[aria-pressed="true"] {
  border-color: var(--accent);
  color: var(--accent);
}
.field {
  display: grid;
  gap: 4px;
  font-size: 14px;
  color: var(--muted);
}
.field input {
  font: inherit;
  font-size: 15px;
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 6px 10px;
  max-width: 320px;
}
.language-list {
  margin: 0;
  padding-inline-start: 20px;
  display: grid;
  gap: 4px;
}
.switcher-loading {
  color: var(--muted);
}

/* cards */
.cards {
  display: grid;
  gap: 16px;
}
.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 20px;
  display: grid;
  gap: 8px;
}
.eyebrow {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 0;
}
.body {
  font-size: 15px;
  color: var(--muted);
}
.widget {
  font-size: 17px;
  color: var(--fg);
}
.counter {
  display: flex;
  align-items: center;
  gap: 12px;
}
.step {
  width: 32px;
  height: 32px;
  flex: none;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--card);
  font-size: 17px;
  line-height: 1;
}
.network {
  display: grid;
  gap: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  background: color-mix(in srgb, var(--line) 55%, transparent);
  border-radius: 8px;
  padding: 10px 12px;
}
.network code {
  font-size: inherit;
}
.cta {
  font-weight: 600;
}

/* footer */
.footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 20px;
  margin-block-start: 28px;
  padding-block-start: 20px;
  border-block-start: 1px solid var(--line);
  font-size: 14px;
  color: var(--muted);
}
.install {
  margin-inline-start: auto;
}
.install code {
  color: var(--fg);
  margin-inline-start: 6px;
}
</style>

/** The same stylesheet the five Vite examples keep in their `index.html`. */
export const css = `
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #16181d;
  --muted: #6b7280;
  --line: #e5e7eb;
  --accent: #2f6df6;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14161a;
    --fg: #e8eaee;
    --muted: #9aa1ad;
    --line: #2a2e36;
    --accent: #7aa2ff;
  }
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 15px/1.55 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
main {
  max-width: 40rem;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
}
h1 {
  font-size: 1.35rem;
  margin: 0 0 1.5rem;
}
section {
  border-top: 1px solid var(--line);
  padding: 0.9rem 0;
}
h2 {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 0.4rem;
  font-weight: 600;
}
button {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.3rem 0.7rem;
  cursor: pointer;
}
button[aria-pressed="true"] {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
a {
  color: var(--accent);
}
code {
  color: var(--muted);
  font-size: 0.85em;
}
`;

// Applies scripts/mutation/accepted.json to a Stryker JSON report (run.mjs --summarize-only).
//
// An entry names a file, the TEXT of one line (`snippet`, trimmed; `lineHint` breaks ties
// when the text occurs more than once) and the mutators it accepts there. It accepts:
//
//   - with `pins` ([{ mutator, column, replacement }]): exactly the mutants pinned — the
//     mutator, the start column counted from the first non-blank character of the line
//     (1-based, so re-indenting keeps the pin) and Stryker's replacement text. Each pin
//     accepts one mutant. Use pins when a line has two mutants of one mutator and only one
//     (or each for its own reason) is accepted.
//   - without pins: ONE mutant per listed mutator. A second mutant of the same mutator on
//     the line is not accepted by the same entry (it used to be: two cache-key separators
//     of one line shared an exemption, lot 1d review B MEDIUM 15); it is listed as a
//     survivor with a hint to pin it.
//   - `mutators: ["all"]`: every mutant on the line, an explicit statement that the line
//     has no behaviour a test can see (a command registration, a log line).
//
// An entry that matches nothing is stale and is listed, so the list cannot rot.
import path from "node:path";

const counts = () => ({ killed: 0, survived: 0, accepted: 0, nocov: 0 });

/**
 * @param {Record<string, { source?: string, mutants: any[] }>} files  report.files
 * @param {Array<object>} entries  accepted.json entries of this package
 * @param {string} cwd  the package directory (report paths resolve against it)
 */
export function applyAccepted(files, entries, cwd) {
  const used = new Set();
  const rows = [];
  const survivors = [];
  const totals = counts();
  // entry index → the line it bound to; entry index + mutator → taken (unpinned entries);
  // entry index + pin index → taken (pinned entries).
  const taken = new Set();
  for (const [file, entry] of Object.entries(files)) {
    const rel = path.relative(cwd, path.resolve(cwd, file));
    const source = (entry.source ?? "").split("\n");
    const row = { file: rel, ...counts() };
    const boundLine = new Map();
    const mutants = [...entry.mutants].sort(
      (a, b) =>
        a.location.start.line - b.location.start.line ||
        a.location.start.column - b.location.start.column,
    );
    for (const m of mutants) {
      if (m.status === "Killed" || m.status === "Timeout") {
        row.killed++;
        continue;
      }
      if (m.status !== "Survived" && m.status !== "NoCoverage" && m.status !== "Ignored") continue;
      const line = m.location.start.line;
      const raw = source[line - 1] ?? "";
      const text = raw.trim();
      // Column from the first non-blank character, 1-based.
      const column = m.location.start.column - (raw.length - raw.trimStart().length);
      let best = -1;
      let bestSlot;
      let bestDist = Infinity;
      let blocked = false;
      entries.forEach((e, i) => {
        if (e.file !== rel || e.snippet !== text) return;
        const bound = boundLine.get(i);
        if (bound !== undefined && bound !== line) return;
        let slot;
        if (e.pins) {
          const p = e.pins.findIndex(
            (pin, j) =>
              pin.mutator === m.mutatorName &&
              pin.column === column &&
              pin.replacement === (m.replacement ?? "") &&
              !taken.has(`${i}#${j}`),
          );
          if (p < 0) return;
          slot = `${i}#${p}`;
        } else if (e.mutators.includes("all")) slot = undefined;
        else if (e.mutators.includes(m.mutatorName)) {
          slot = `${i}:${m.mutatorName}`;
          if (taken.has(slot)) {
            blocked = true;
            return;
          }
        } else return;
        const dist = Math.abs((e.lineHint ?? line) - line);
        if (dist < bestDist) {
          best = i;
          bestSlot = slot;
          bestDist = dist;
        }
      });
      if (best >= 0) {
        boundLine.set(best, line);
        if (bestSlot) taken.add(bestSlot);
        used.add(best);
        row.accepted++;
      } else if (m.status === "NoCoverage") {
        row.nocov++;
      } else if (m.status === "Survived") {
        row.survived++;
        survivors.push(
          `${rel}:${line}:${column} ${m.mutatorName} -> ${(m.replacement ?? "").split("\n")[0].slice(0, 70)}` +
            (blocked
              ? ` (a second ${m.mutatorName} mutant of an accepted line: pin each with "pins")`
              : ""),
        );
      }
    }
    for (const k of Object.keys(totals)) totals[k] += row[k];
    rows.push(row);
  }
  const stale = entries
    .map((e, i) =>
      used.has(i) ? null : `${e.file} [${e.mutators.join(",")}] "${e.snippet.slice(0, 60)}"`,
    )
    .filter(Boolean);
  return { rows, totals, survivors, stale };
}

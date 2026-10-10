"use client";

import { useEffect, useState } from "react";

const KEY = "comvi-example-count";

// Switching the locale navigates to another URL, which remounts the page, so
// the count lives in sessionStorage. The first mount hydrates server HTML that
// says 2 and restores after mount; later client-side mounts read it at once.
let hydrated = false;

function stored(): number {
  const value = sessionStorage.getItem(KEY);
  const count = value === null ? Number.NaN : Number(value);
  return Number.isInteger(count) && count >= 0 ? count : 2;
}

export function useCount() {
  const [count, setCount] = useState(() => (hydrated ? stored() : 2));
  useEffect(() => {
    if (hydrated) return;
    hydrated = true;
    setCount(stored());
  }, []);
  const change = (delta: number) =>
    setCount((current) => {
      const next = Math.max(0, current + delta);
      sessionStorage.setItem(KEY, String(next));
      return next;
    });
  return [count, change] as const;
}

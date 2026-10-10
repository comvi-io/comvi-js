"use client";

import { useEffect, useState } from "react";

/**
 * The greeting's `{name}`: "Ada", or `?name=…` from the address bar. Read after
 * mount, because these pages are prerendered and the server never sees the query.
 */
export function useName(): string {
  const [name, setName] = useState("Ada");
  useEffect(() => {
    const fromQuery = new URLSearchParams(location.search).get("name");
    if (fromQuery !== null) setName(fromQuery);
  }, []);
  return name;
}

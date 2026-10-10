"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type NameState = readonly [name: string, setName: (name: string) => void];

const NameContext = createContext<NameState>(["Ada", () => {}]);

/**
 * The greeting's `{name}`, shared by both pages: "Ada", or `?name=…` from the
 * address bar. The query is read after mount, because these pages are
 * prerendered and the server never sees it.
 */
export function NameProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState("Ada");
  useEffect(() => {
    const fromQuery = new URLSearchParams(location.search).get("name");
    if (fromQuery !== null) setName(fromQuery);
  }, []);
  return <NameContext.Provider value={[name, setName]}>{children}</NameContext.Provider>;
}

export function useName(): NameState {
  return useContext(NameContext);
}

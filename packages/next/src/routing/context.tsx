"use client";

import React, { createContext, useContext, useMemo } from "react";
import type { RoutingConfig } from "./types";
import { defineRouting } from "./defineRouting";

const RoutingContext = createContext<Required<RoutingConfig> | null>(null);

export interface RoutingProviderProps {
  routing: RoutingConfig;
  children: React.ReactNode;
}

export function RoutingProvider({ routing, children }: RoutingProviderProps) {
  const value = useMemo(() => defineRouting(routing), [routing]);
  return <RoutingContext.Provider value={value}>{children}</RoutingContext.Provider>;
}

export function useRoutingConfig(): Required<RoutingConfig> | null {
  return useContext(RoutingContext);
}

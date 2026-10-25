import React from "react";

export function BoldComponent({ children }: { children: React.ReactNode }) {
  return <span className="font-extrabold text-purple-600">{children}</span>;
}

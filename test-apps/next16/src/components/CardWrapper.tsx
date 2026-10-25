import { ReactNode } from "react";

export function CardWrapper({ children }: { children?: ReactNode }) {
  return <div className="bg-white rounded-lg shadow-sm border p-4">{children}</div>;
}

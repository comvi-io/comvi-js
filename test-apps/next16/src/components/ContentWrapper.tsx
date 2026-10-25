import { ReactNode } from "react";

export function ContentWrapper({ children }: { children?: ReactNode }) {
  return <p className="text-gray-700">{children}</p>;
}

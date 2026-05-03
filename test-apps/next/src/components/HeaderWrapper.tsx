import { ReactNode } from "react";

export function HeaderWrapper({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 font-semibold text-blue-800 mb-2 border-b pb-2">
      {children}
    </div>
  );
}

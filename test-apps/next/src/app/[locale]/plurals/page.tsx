"use client";

import { useI18n } from "@comvi/next/client";
import { useState } from "react";

export default function PluralsPage() {
  const { t } = useI18n();
  const [notificationCount, setNotificationCount] = useState(0);
  const [itemCount, setItemCount] = useState(1);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">{t("plurals.title")}</h2>

      {/* Notifications Example */}
      <div className="space-y-4 p-6 border rounded-lg bg-gray-50">
        <h3 className="font-semibold text-lg">Notifications (ICU Plural)</h3>
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 5, 10].map((n) => (
            <button
              key={n}
              onClick={() => setNotificationCount(n)}
              className={`px-3 py-1 rounded bg-white border shadow-sm hover:bg-gray-50 ${
                notificationCount === n ? "ring-2 ring-blue-500 border-blue-500" : ""
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-xl font-medium text-blue-600">
          {t("plurals.notifications", { count: notificationCount })}
        </p>
      </div>

      {/* Cart Items Example */}
      <div className="space-y-4 p-6 border rounded-lg bg-gray-50">
        <h3 className="font-semibold text-lg">Shopping Cart</h3>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="10"
            value={itemCount}
            onChange={(e) => setItemCount(Number(e.target.value))}
            className="w-full max-w-xs"
          />
          <span className="font-mono w-8">{itemCount}</span>
        </div>
        <p className="text-xl font-medium text-green-600">
          {t("plurals.items", { count: itemCount })}
        </p>
      </div>
    </div>
  );
}

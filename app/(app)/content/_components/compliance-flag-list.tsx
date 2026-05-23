"use client";

import type { ComplianceFlag } from "@/lib/compliance/filter";

const layerLabels: Record<ComplianceFlag["layer"], string> = {
  1: "Layer 1 (Keywords)",
  2: "Layer 2 (Numbers)",
  3: "Layer 3 (AI Review)",
  4: "Layer 4 (Disclosure)",
};

export function ComplianceFlagList({ flags }: { flags: ComplianceFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="space-y-3">
      {flags.map((flag) => (
        <div key={`${flag.layer}-${flag.code}-${flag.excerpt}`} className="border-l-4 border-red-500 bg-red-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {flag.code}
            </span>
            <span className="text-xs font-medium text-red-700">{layerLabels[flag.layer]}</span>
          </div>
          <p className="mt-2 text-sm text-red-900">{flag.message}</p>
          {flag.excerpt ? (
            <code className="mt-2 block truncate rounded bg-white px-2 py-1 text-xs text-red-800">
              {flag.excerpt}
            </code>
          ) : null}
        </div>
      ))}
    </div>
  );
}

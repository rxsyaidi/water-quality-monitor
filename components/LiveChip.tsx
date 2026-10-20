"use client";

import { useEffect, useState } from "react";
import { SAMPLE_MS, fmt } from "@/lib/monitor";
import { StatusDot } from "./ui";

// The hero chip. Simulated until the board posts real readings.
export function LiveChip() {
  const [r, setR] = useState({ ph: 7.21, ntu: 1.8 });

  useEffect(() => {
    const id = setInterval(() => {
      setR((p) => ({
        ph: Math.min(7.45, Math.max(7.0, p.ph + (7.2 - p.ph) * 0.2 + (Math.random() - 0.5) * 0.05)),
        ntu: Math.min(2.4, Math.max(1.1, p.ntu + (1.7 - p.ntu) * 0.2 + (Math.random() - 0.5) * 0.18)),
      }));
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-xl border border-line bg-card px-3.5 py-2.5 shadow-[0_1px_2px_rgb(15_27_38/0.06),0_4px_12px_rgb(15_27_38/0.06)]">
      <div className="flex items-center gap-1.5 text-xs text-ink-2">
        <StatusDot level="safe" />
        Monitor 01 · simulated
      </div>
      <div className="mt-0.5 text-lg font-light tracking-tight" aria-live="off">
        pH {fmt("ph", r.ph)} <span className="text-faint">·</span> {fmt("ntu", r.ntu)} NTU
      </div>
    </div>
  );
}

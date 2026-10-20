"use client";

import { useEffect, useRef, useState } from "react";
import { LIMITS, type Kind } from "@/lib/monitor";

const C = { ink: "#0f1b26", faint: "#5d6974", line: "#e8ecef", safe: "#1d7f45", safeFill: "#e6f2ea", stop: "#f8dedb", bad: "#c42b23" };

// pH on a linear axis, turbidity on a log axis so a 38 NTU spike and a
// 1.7 NTU baseline both stay readable. Red columns mark where the pump was off.
export function LineChart({
  kind,
  data,
  stopped,
  height = 160,
  xLabels,
}: {
  kind: Kind;
  data: number[];
  stopped: boolean[];
  height?: number;
  xLabels: string[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isPh = kind === "ph";
  const [ymin, ymax] = isPh ? [6, 9.5] : [0.5, 100];
  const pl = 34, pr = 4, pt = 6, pb = 20;
  const t = (v: number) => (isPh ? (v - ymin) / (ymax - ymin) : (Math.log10(v) - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin)));
  const Y = (v: number) => pt + (1 - Math.min(1, Math.max(0, t(v)))) * (height - pt - pb);
  const X = (i: number) => pl + (i / (data.length - 1)) * (w - pl - pr);
  const lo = isPh ? LIMITS.ph.min : ymin;
  const hi = isPh ? LIMITS.ph.max : LIMITS.ntu.max;
  const ticks = isPh ? [LIMITS.ph.min, 7.5, LIMITS.ph.max] : [1, LIMITS.ntu.max, 50];
  const step = (w - pl - pr) / (data.length - 1);

  const spans: [number, number][] = [];
  stopped.forEach((s, i) => {
    if (!s) return;
    const last = spans[spans.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else spans.push([i, i]);
  });

  const points = data.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");

  return (
    <div ref={box} className="w-full">
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} className="block overflow-visible" aria-hidden="true">
        <rect x={pl} y={Y(hi)} width={w - pl - pr} height={Y(lo) - Y(hi)} fill={C.safeFill} />
        {spans.map(([a, b]) => (
          <rect key={a} x={X(a) - step / 2} y={pt} width={X(b) - X(a) + step} height={height - pt - pb} fill={C.stop} />
        ))}
        {(isPh ? [lo, hi] : [hi]).map((v) => (
          <line key={v} x1={pl} x2={w - pr} y1={Y(v)} y2={Y(v)} stroke={C.safe} strokeDasharray="3 3" />
        ))}
        {ticks.map((v) => (
          <text key={v} x={pl - 8} y={Y(v) + 4} fontSize="11" fill={C.faint} textAnchor="end">
            {v}
          </text>
        ))}
        {xLabels.map((l, k) => (
          <text
            key={l}
            x={pl + (k / (xLabels.length - 1)) * (w - pl - pr)}
            y={height - 4}
            fontSize="11"
            fill={C.faint}
            textAnchor={k === 0 ? "start" : k === xLabels.length - 1 ? "end" : "middle"}
          >
            {l}
          </text>
        ))}
        <polyline fill="none" stroke={C.ink} strokeWidth="1.5" strokeLinejoin="round" points={points} />
        <circle cx={X(data.length - 1)} cy={Y(data[data.length - 1])} r="3.5" fill={stopped[stopped.length - 1] ? C.bad : C.ink} stroke="#fff" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

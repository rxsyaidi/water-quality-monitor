"use client";

// The pH or turbidity line over a time range, drawn as plain SVG: the safe band, red columns where the
// pump was off, dark blocks where the board sent nothing, and the latest reading as a ringed dot.
// Two skins: "water" for the blue hero, "light" for white panels. Every fill is solid (no opacity).
import { useEffect, useMemo, useRef, useState } from "react";
import { clock, fmtLimit, fmtNtu, fmtPh, RANGES, type Device, type Range, type SeriesPoint } from "@/lib/data";

export type Stop = { from: number; to: number };
export type Metric = "ph" | "ntu";

const SKINS = {
  water: {
    band: "#1C5A5C",
    grid: "#2A6CAA",
    axis: "#B9D3EC",
    line: "#FFFFFF",
    stop: "#D9534B",
    ring: "#0B4F8E",
    gap: "#08406F",
    scrub: "#DCE9F6",
  },
  light: {
    band: "#DCEFE3",
    grid: "#DCE4EC",
    axis: "#5A6876",
    line: "#0A5CA8",
    stop: "#F4CFCB",
    ring: "#FFFFFF",
    gap: "#E9EEF3",
    scrub: "#41505E",
  },
} as const;

export const LEGEND = {
  water: { band: "#1C5A5C", bandEdge: "#3D7E7F", stop: "#D9534B", gap: "#08406F", gapEdge: "#2A6CAA" },
  light: { band: "#DCEFE3", bandEdge: "#B9DCC6", stop: "#F4CFCB", gap: "#E9EEF3", gapEdge: "#DCE4EC" },
} as const;

const padL = 34;
const padR = 8;
const padT = 8;
const padB = 22;

function niceTop(v: number) {
  const steps = [8, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 4000];
  return steps.find((s) => s >= v) ?? 4000;
}

function timeTicks(range: Range, from: number, to: number) {
  const out: { t: number; label: string }[] = [];
  const d = new Date(from);
  if (range === "1H") {
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    for (let t = d.getTime(); t < to; t += 15 * 60e3) out.push({ t, label: clock(t) });
  } else if (range === "24H") {
    d.setHours(Math.ceil((d.getHours() + (d.getMinutes() ? 1 : 0)) / 6) * 6, 0, 0, 0);
    for (let t = d.getTime(); t < to; t += 6 * 3600e3) out.push({ t, label: clock(t) });
  } else {
    d.setHours(24, 0, 0, 0);
    const every = range === "7D" ? 1 : 7;
    for (let t = d.getTime(); t < to; t += every * 86400e3) {
      const x = new Date(t);
      out.push({
        t,
        label:
          range === "7D"
            ? x.toLocaleDateString("en-GB", { weekday: "short" })
            : x.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      });
    }
  }
  return out;
}

export function WaterChart({
  metric,
  device,
  series,
  stops,
  range,
  from,
  to,
  offlineSince,
  variant = "water",
  height = 190,
}: {
  metric: Metric;
  device: Device;
  series: SeriesPoint[];
  stops: Stop[];
  range: Range;
  from: number;
  to: number;
  offlineSince: number | null;
  variant?: "water" | "light";
  height?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const c = SKINS[variant];

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = useMemo(
    () =>
      series
        .map((p) => ({ t: Date.parse(p.t), v: Number(metric === "ph" ? p.ph : p.ntu) }))
        .filter((p) => p.t >= from && p.t <= to && Number.isFinite(p.v)),
    [series, metric, from, to],
  );

  const H = height;
  const w = Math.max(0, W - padL - padR);
  const h = H - padT - padB;

  const dataMax = pts.reduce((m, p) => Math.max(m, p.v), 0);
  const [lo, hi] =
    metric === "ph"
      ? [Math.min(5.5, device.ph_min - 1), Math.max(9.5, device.ph_max + 1)]
      : [0, niceTop(Math.max(8, device.ntu_max * 1.6, dataMax * 1.08))];
  const ticks =
    metric === "ph"
      ? [device.ph_min, +((device.ph_min + device.ph_max) / 2).toFixed(2), device.ph_max]
      : [0, device.ntu_max, hi];
  const X = (t: number) => padL + ((t - from) / (to - from)) * w;
  const Y = (v: number) => padT + h - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * h;

  // break the line where readings stopped coming for more than three buckets
  const gapMs = Math.max(RANGES[range].bucketMs * 3, 90e3);
  const runs: { t: number; v: number }[][] = [];
  const gaps: { a: number; b: number }[] = [];
  pts.forEach((p, i) => {
    const prev = pts[i - 1];
    if (!prev || p.t - prev.t > gapMs) {
      if (prev) gaps.push({ a: prev.t, b: p.t });
      runs.push([]);
    }
    runs[runs.length - 1].push(p);
  });
  const last = pts[pts.length - 1];
  const trailing = offlineSince !== null ? Math.max(from, Math.min(offlineSince, last?.t ?? offlineSince)) : null;

  const bandTop = Y(metric === "ph" ? device.ph_max : device.ntu_max);
  const bandBot = Y(metric === "ph" ? device.ph_min : 0);
  const bandText = metric === "ph" ? `Safe ${fmtLimit(device.ph_min)} to ${fmtLimit(device.ph_max)}` : `Safe up to ${fmtLimit(device.ntu_max)} NTU`;
  const tticks = W ? timeTicks(range, from, to).filter((k) => X(k.t) > padL + 18 && X(k.t) < padL + w - 44) : [];
  const fmtV = (v: number) => (metric === "ph" ? `pH ${fmtPh(v)}` : `${fmtNtu(v)} NTU`);
  const hp = hover !== null ? pts[hover] : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!pts.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = from + ((e.clientX - r.left - padL) / w) * (to - from);
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].t - t) < Math.abs(pts[best].t - t)) best = i;
    setHover(best);
  }

  const label =
    metric === "ph"
      ? `pH over the last ${range}, safe band ${fmtLimit(device.ph_min)} to ${fmtLimit(device.ph_max)}`
      : `Turbidity over the last ${range}, safe up to ${fmtLimit(device.ntu_max)} NTU`;

  return (
    <div ref={wrap} className="chart" style={{ height: H }}>
      {W > 0 && (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={last ? `${label}. Latest ${fmtV(last.v)}.` : `${label}. No readings yet.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          fontFamily="var(--font-sans)"
        >
          <rect x={padL} y={bandTop} width={w} height={Math.max(0, bandBot - bandTop)} fill={c.band} />
          {bandBot - bandTop > 16 && (
            <text x={padL + w * 0.42} y={bandTop + 13} fontSize="10.5" fill={c.axis}>
              {bandText}
            </text>
          )}
          {ticks.map((t, i) => (
            <g key={`${t}-${i}`}>
              <line
                x1={padL}
                x2={padL + w}
                y1={Y(t)}
                y2={Y(t)}
                stroke={c.grid}
                strokeWidth="1"
                strokeDasharray={i === 1 ? undefined : "3 3"}
              />
              <text x={padL - 6} y={Y(t) + 4} textAnchor="end" fontSize="10.5" fill={c.axis}>
                {fmtLimit(t)}
              </text>
            </g>
          ))}
          {gaps.map((g) => (
            <rect key={`g${g.a}`} x={X(g.a)} y={padT} width={Math.max(2, X(g.b) - X(g.a))} height={h} fill={c.gap} />
          ))}
          {stops.map((s) => {
            const a = X(Math.max(from, s.from));
            const b = X(Math.min(to, s.to));
            return b >= padL && <rect key={`s${s.from}`} x={a} y={padT} width={Math.max(3, b - a)} height={h} fill={c.stop} />;
          })}
          {runs.map((run) =>
            run.length === 1 ? (
              <circle key={`r${run[0].t}`} cx={X(run[0].t)} cy={Y(run[0].v)} r="1.5" fill={c.line} />
            ) : (
              <polyline
                key={`r${run[0].t}`}
                points={run.map((p) => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={c.line}
                strokeWidth="1.75"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ),
          )}
          {trailing !== null && X(to) - X(trailing) > 2 && (
            <>
              <rect x={X(trailing)} y={padT} width={X(to) - X(trailing)} height={h} fill={c.gap} />
              {X(to) - X(trailing) > 56 && (
                <text x={X(to) - 4} y={padT + 13} textAnchor="end" fontSize="10.5" fill={c.axis}>
                  No data
                </text>
              )}
            </>
          )}
          {last && <circle cx={X(last.t)} cy={Y(last.v)} r="4" fill={c.line} stroke={c.ring} strokeWidth="2" />}
          {tticks.map((k) => (
            <text key={k.t} x={X(k.t)} y={H - 6} textAnchor="middle" fontSize="10.5" fill={c.axis}>
              {k.label}
            </text>
          ))}
          <text x={padL + w} y={H - 6} textAnchor="end" fontSize="10.5" fill={c.axis}>
            Now
          </text>
          {hp && (
            <g pointerEvents="none">
              <line x1={X(hp.t)} x2={X(hp.t)} y1={padT} y2={padT + h} stroke={c.scrub} strokeWidth="1" />
              <circle cx={X(hp.t)} cy={Y(hp.v)} r="3.5" fill={c.line} stroke={c.ring} strokeWidth="1.5" />
              <text
                x={Math.min(Math.max(X(hp.t), padL + 50), padL + w - 50)}
                y={padT + 12}
                textAnchor="middle"
                fontSize="11.5"
                fontWeight="500"
                fill={variant === "water" ? "#FFFFFF" : "#0D1A26"}
                stroke={variant === "water" ? "#0B4F8E" : "#FFFFFF"}
                strokeWidth="4"
                paintOrder="stroke"
              >
                {`${range === "1H" || range === "24H" ? clock(hp.t) : new Date(hp.t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${fmtV(hp.v)}`}
              </text>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

export function ChartLegend({ variant = "water", gap = false }: { variant?: "water" | "light"; gap?: boolean }) {
  const l = LEGEND[variant];
  return (
    <div className={`legend${variant === "light" ? " light" : ""}`}>
      <span>
        <i style={{ background: l.band, border: `1px solid ${l.bandEdge}` }} />
        Safe range
      </span>
      <span>
        <i style={{ background: l.stop }} />
        Pump off
      </span>
      {gap && (
        <span>
          <i style={{ background: l.gap, border: `1px solid ${l.gapEdge}` }} />
          No data
        </span>
      )}
    </div>
  );
}

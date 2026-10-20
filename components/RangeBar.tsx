import { LIMITS, fmt, isOut, scalePos, type Kind } from "@/lib/monitor";

// Grey track, pale green safe band, a tick at each limit. The marker is ink
// while the reading is safe and turns red only when it leaves the band.
export function RangeBar({ kind, value }: { kind: Kind; value: number }) {
  const lo = kind === "ph" ? LIMITS.ph.min : 0.1;
  const hi = kind === "ph" ? LIMITS.ph.max : LIMITS.ntu.max;
  const limits = kind === "ph" ? [LIMITS.ph.min, LIMITS.ph.max] : [LIMITS.ntu.max];
  const labels = kind === "ph" ? [0, LIMITS.ph.min, LIMITS.ph.max, 14] : [0.1, 1, LIMITS.ntu.max, 50, 1000];
  const out = isOut(kind, value);
  const label =
    kind === "ph"
      ? `pH ${fmt("ph", value)} on a scale of 0 to 14, safe from ${LIMITS.ph.min} to ${LIMITS.ph.max}`
      : `Turbidity ${fmt("ntu", value)} NTU, safe up to ${LIMITS.ntu.max} NTU`;

  return (
    <div role="img" aria-label={label} className="select-none">
      <div className="relative mt-1.5 h-1.5 rounded-full bg-track">
        <div
          className="absolute inset-y-0 bg-safe-band"
          style={{ left: `${scalePos(kind, lo)}%`, width: `${scalePos(kind, hi) - scalePos(kind, lo)}%` }}
        />
        {limits.map((t) => (
          <div key={t} className="absolute -top-1 h-3.5 w-px bg-faint" style={{ left: `${scalePos(kind, t)}%` }} />
        ))}
        <div
          className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card transition-[left,background-color] duration-700 ease-out-expo ${out ? "bg-unsafe" : "bg-ink"}`}
          style={{ left: `${scalePos(kind, value)}%` }}
        />
      </div>
      <div className="relative mt-2 h-4 text-xs text-faint">
        {labels.map((t, i) => (
          <span
            key={t}
            className="absolute top-0"
            style={{
              left: `${scalePos(kind, t)}%`,
              transform: i === 0 ? "none" : i === labels.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

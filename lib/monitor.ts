// One place for the safety rules. The board firmware uses the same numbers.
// The upper pH limit is 8.5 (common operating range); the Malaysian drinking
// water standard allows 9.0. Change it here once the supervisor confirms.
export const LIMITS = {
  ph: { min: 6.5, max: 8.5 },
  ntu: { max: 5 },
} as const;

export const SAMPLE_MS = 2000; // the board reads both sensors every 2 s
export const CONFIRM_MS = 2000; // a reading must stay out of range this long before the pump stops
export const RESTART_MS = 30000; // readings must stay in range this long before the pump restarts

export const REPO_URL = "https://github.com/rxsyaidi/water-quality-monitor";

export type Kind = "ph" | "ntu";
export type Level = "safe" | "check" | "unsafe" | "offline";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Position on the range bar, 0 to 100. pH is linear 0 to 14, turbidity is log 0.1 to 1000 NTU. */
export function scalePos(kind: Kind, v: number) {
  if (kind === "ph") return clamp(v / 14, 0, 1) * 100;
  return clamp((Math.log10(Math.max(v, 0.1)) + 1) / 4, 0, 1) * 100;
}

export function isOut(kind: Kind, v: number) {
  return kind === "ph" ? v < LIMITS.ph.min || v > LIMITS.ph.max : v > LIMITS.ntu.max;
}

export function fmt(kind: Kind, v: number) {
  if (kind === "ph") return v.toFixed(2);
  return v < 10 ? v.toFixed(1) : Math.round(v).toString();
}

/** Plain reason for an out of range reading, or null when it is inside the limits. */
export function reason(ph: number, ntu: number) {
  if (ph > LIMITS.ph.max) return `pH ${fmt("ph", ph)} is above the ${LIMITS.ph.max} limit`;
  if (ph < LIMITS.ph.min) return `pH ${fmt("ph", ph)} is below the ${LIMITS.ph.min} limit`;
  if (ntu > LIMITS.ntu.max) return `Turbidity ${fmt("ntu", ntu)} NTU is above the ${LIMITS.ntu.max} NTU limit`;
  return null;
}

export const phRange = `${LIMITS.ph.min} to ${LIMITS.ph.max}`;

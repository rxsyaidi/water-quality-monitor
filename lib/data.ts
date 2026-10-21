// Shapes of the database rows and the plain words the app uses for them.

export type BoardState = "safe" | "checking" | "stopped" | "restarting";
export type Status = BoardState | "offline" | "waiting";
/** A sample poured into the virtual board: a high pH buffer or muddy water. */
export type Fault = "ph" | "ntu";

export type Device = {
  id: string;
  name: string;
  key_hint: string | null;
  ph_min: number;
  ph_max: number;
  ntu_max: number;
  confirm_s: number;
  restart_s: number;
  ph_slope: number;
  ph_offset: number;
  clear_volt: number;
  calibrated_at: string | null;
  last_seen_at: string | null;
  last_ph: number | null;
  last_ntu: number | null;
  last_ph_v: number | null;
  last_ntu_v: number | null;
  pump_on: boolean | null;
  state: BoardState | null;
  /** When the current state began, so countdowns run from the record rather than from one tab. */
  state_since: string | null;
  /** A sample poured into the virtual board, and when it stops pushing the readings. */
  sim_fault: Fault | null;
  sim_fault_until: string | null;
  last_source: "board" | "virtual" | null;
  created_at: string;
};

export const DEVICE_COLUMNS =
  "id,name,key_hint,ph_min,ph_max,ntu_max,confirm_s,restart_s,ph_slope,ph_offset,clear_volt,calibrated_at," +
  "last_seen_at,last_ph,last_ntu,last_ph_v,last_ntu_v,pump_on,state,state_since,sim_fault,sim_fault_until,last_source,created_at";

export type EventKind =
  | "checking"
  | "stopped"
  | "back_in_range"
  | "restarted"
  | "false_alarm"
  | "offline"
  | "calibrated"
  | "limits_changed"
  | "connected";

export type DeviceEvent = {
  id: number;
  at: string;
  kind: EventKind;
  ph: number | null;
  ntu: number | null;
  detail: string;
  ended_at: string | null;
};

export const EVENT_COLUMNS = "id,at,kind,ph,ntu,detail,ended_at";

export type TestRun = {
  id: number;
  sample: string;
  expect: "runs" | "stops";
  started_at: string;
  ended_at: string | null;
  notes: string | null;
};

export type Calibration = {
  id: number;
  at: string;
  sensor: "ph" | "ntu";
  points: { ph?: number; v: number }[];
  ph_slope: number | null;
  ph_offset: number | null;
  clear_volt: number | null;
};

export type SeriesPoint = { t: string; ph: number; ntu: number; n: number };

export type Stats = {
  n: number;
  ph_min: number;
  ph_avg: number;
  ph_max: number;
  ntu_min: number;
  ntu_avg: number;
  ntu_max: number;
  /** Share of the time in range, weighted by how long each reading stood. */
  in_range_pct: number | null;
  /** Readings from the real board; the rest were simulated. */
  board_n: number;
};

/** No reading for this long and the board counts as offline (the record uses the same 30 s). */
export const OFFLINE_S = 30;
export const SAMPLE_S = 2;

export function statusOf(d: Device | null | undefined, now: number | null): Status {
  if (!d?.last_seen_at) return "waiting";
  if (now !== null && now - Date.parse(d.last_seen_at) > OFFLINE_S * 1000) return "offline";
  return d.state ?? "safe";
}

/** Colour is only for state (ISA-101): red pump stop, amber checking, green safe, grey for the rest. */
export type Tone = "unsafe" | "check" | "safe" | "neutral";

export const EVENT_WORDS: Record<EventKind, { title: string; tone: Tone }> = {
  checking: { title: "Checking", tone: "check" },
  stopped: { title: "Pump stopped", tone: "unsafe" },
  back_in_range: { title: "Back in range", tone: "check" },
  restarted: { title: "Pump restarted", tone: "safe" },
  false_alarm: { title: "False alarm", tone: "neutral" },
  offline: { title: "Board offline", tone: "neutral" },
  calibrated: { title: "Calibrated", tone: "neutral" },
  limits_changed: { title: "Limits changed", tone: "neutral" },
  connected: { title: "Board connected", tone: "neutral" },
};

export const fmtPh = (v: number | null | undefined) => (v === null || v === undefined ? "–" : Number(v).toFixed(2));
export const fmtNtu = (v: number | null | undefined) =>
  v === null || v === undefined ? "–" : v < 10 ? Number(v).toFixed(1) : Math.round(v).toString();
/** Limits read the way people write them: 8.5, not 8.50. */
export const fmtLimit = (v: number) => String(Number(v));

export function clock(iso: string | number) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** "Today", "Yesterday" or "Mon 19 Oct". */
export function dayLabel(iso: string | number, now: number) {
  const d = new Date(iso);
  const today = new Date(now);
  const yest = new Date(now - 86400000);
  if (dayKey(d) === dayKey(today)) return "Today";
  if (dayKey(d) === dayKey(yest)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** "14:32" today, "14:32 yesterday", or "14:32, Mon 19 Oct". */
export function when(iso: string | number, now: number) {
  const day = dayLabel(iso, now);
  if (day === "Today") return clock(iso);
  if (day === "Yesterday") return `${clock(iso)} yesterday`;
  return `${clock(iso)}, ${day}`;
}

export function ago(iso: string | number, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function duration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

export function phWord(d: Device, ph: number) {
  if (ph > d.ph_max) return { word: "Too high", tone: "unsafe" as Tone };
  if (ph < d.ph_min) return { word: "Too low", tone: "unsafe" as Tone };
  return { word: "In range", tone: "safe" as Tone };
}

export function ntuWord(d: Device, ntu: number) {
  return ntu > d.ntu_max ? { word: "Too cloudy", tone: "unsafe" as Tone } : { word: "Clear", tone: "safe" as Tone };
}

/** Plain reason for the current reading, or null when both are inside the limits. */
export function outReason(d: Device, ph: number, ntu: number) {
  if (ph > d.ph_max) return `pH ${fmtPh(ph)} is above the ${fmtLimit(d.ph_max)} limit`;
  if (ph < d.ph_min) return `pH ${fmtPh(ph)} is below the ${fmtLimit(d.ph_min)} limit`;
  if (ntu > d.ntu_max) return `Turbidity ${fmtNtu(ntu)} NTU is above the ${fmtLimit(d.ntu_max)} NTU limit`;
  return null;
}

export type Range = "1H" | "24H" | "7D" | "30D";
export const RANGES: Record<Range, { ms: number; bucket: string; bucketMs: number }> = {
  "1H": { ms: 3600e3, bucket: "30 seconds", bucketMs: 30e3 },
  "24H": { ms: 86400e3, bucket: "10 minutes", bucketMs: 600e3 },
  "7D": { ms: 7 * 86400e3, bucket: "1 hour", bucketMs: 3600e3 },
  "30D": { ms: 30 * 86400e3, bucket: "6 hours", bucketMs: 6 * 3600e3 },
};

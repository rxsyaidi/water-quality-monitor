"use client";

// Small shared pieces of the app: the tank switcher, segmented controls, page headers, the event
// timeline, the reading rows with range bars, the virtual board controls and the range data hook.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLive } from "./Live";
import { Icon } from "./icons";
import type { Stop } from "./WaterChart";
import {
  ago,
  clock,
  dayLabel,
  duration,
  EVENT_COLUMNS,
  EVENT_WORDS,
  fmtNtu,
  fmtPh,
  ntuWord,
  phWord,
  RANGES,
  type Device,
  type DeviceEvent,
  type Range,
  type SeriesPoint,
  type Stats,
  type Status,
  type Tone,
} from "@/lib/data";
import { scalePos } from "@/lib/monitor";

const TONE_CLASS: Record<Tone, string> = { safe: "t-safe", check: "t-check", unsafe: "t-unsafe", neutral: "t-neutral" };
const WATER_CLASS: Record<Tone, string> = { safe: "w-safe", check: "w-check", unsafe: "w-unsafe", neutral: "w-off" };

export function Dot({ tone, water = false }: { tone: Tone; water?: boolean }) {
  return <i aria-hidden="true" className={`dot ${(water ? WATER_CLASS : TONE_CLASS)[tone]}`} />;
}

export const STATUS_WORDS: Record<Status, { word: string; tone: Tone }> = {
  safe: { word: "Safe", tone: "safe" },
  checking: { word: "Checking", tone: "check" },
  stopped: { word: "Pump stopped", tone: "unsafe" },
  restarting: { word: "Restarting", tone: "check" },
  offline: { word: "Board offline", tone: "neutral" },
  waiting: { word: "Waiting for readings", tone: "neutral" },
};

/** The tank's name, which opens a native picker when there is more than one tank. */
export function DeviceSwitcher() {
  const { devices, device, select } = useLive();
  if (!device) return null;
  return (
    <span className="devsel">
      {device.name}
      {devices.length > 1 && (
        <>
          <Icon name="chevron" size={16} />
          <select aria-label="Choose a tank" value={device.id} onChange={(e) => select(e.target.value)}>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </>
      )}
    </span>
  );
}

export function sourceWord(d: Device | null) {
  if (!d?.last_source) return "No board yet";
  return d.last_source === "virtual" ? "Simulated" : "Real board";
}

/** Header for the inner pages: the water blue ground on a phone, a water blue band card on a desktop. */
export function PageHead({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  const { device, status } = useLive();
  const s = STATUS_WORDS[status];
  return (
    <header className="pg-head">
      <div className="devrow">
        <DeviceSwitcher />
        {device && (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <Dot tone={s.tone} water />
            {s.word}
          </span>
        )}
        {device && <span>{sourceWord(device)}</span>}
      </div>
      <h1 className="pg-title">{title}</h1>
      {sub && <p className="pg-sub">{sub}</p>}
      {children}
    </header>
  );
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
  light = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  light?: boolean;
}) {
  return (
    <div className={`seg${light ? " light" : ""}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const RANGE_OPTIONS = (["1H", "24H", "7D", "30D"] as const).map((r) => ({ value: r, label: r }));
export const RANGE_NAMES: Record<Range, string> = {
  "1H": "Last hour",
  "24H": "Last 24 hours",
  "7D": "Last 7 days",
  "30D": "Last 30 days",
};

export type TimelineItem = { key: string | number; at: string | number; title: string; detail: string; tone: Tone };

/** Turns an event row into a timeline line, adding how long a stop or a check lasted. */
export function eventItem(e: DeviceEvent, now: number): TimelineItem {
  const w = EVENT_WORDS[e.kind];
  let detail = e.detail;
  if (e.kind === "stopped") {
    detail += e.ended_at
      ? `, off ${duration(Date.parse(e.ended_at) - Date.parse(e.at))}`
      : `, off ${duration(now - Date.parse(e.at))} so far`;
  }
  return { key: e.id, at: e.at, title: w.title, detail, tone: w.tone };
}

export function Timeline({ items, now, showDay = true }: { items: TimelineItem[]; now: number; showDay?: boolean }) {
  return (
    <ol className="events">
      {items.map((it) => {
        const day = dayLabel(it.at, now);
        return (
          <li key={it.key}>
            <time className="mono" dateTime={new Date(it.at).toISOString()}>
              {clock(it.at)}
            </time>
            <span className="tl">
              <Dot tone={it.tone} />
            </span>
            <div className="what">
              {it.title}
              <span>
                {it.detail}
                {showDay && day !== "Today" ? ` · ${day}` : ""}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** pH and turbidity now, each with a bar that shows the reading against the safe band. */
export function ReadingRows({ device, status, now }: { device: Device; status: Status; now: number | null }) {
  const stale = status === "offline" && device.last_seen_at && now ? `${ago(device.last_seen_at, now).replace(" ago", "")} old` : null;
  const ph = device.last_ph;
  const ntu = device.last_ntu;
  const pw = ph !== null ? phWord(device, ph) : null;
  const nw = ntu !== null ? ntuWord(device, ntu) : null;
  return (
    <div className="rows">
      <div className="row">
        <span className="k">pH</span>
        <div>
          <span className="v">{fmtPh(ph)}</span>
          <div className="rb" aria-hidden="true">
            <div
              className="rb-band"
              style={{ left: `${scalePos("ph", device.ph_min)}%`, width: `${scalePos("ph", device.ph_max) - scalePos("ph", device.ph_min)}%` }}
            />
            {ph !== null && <div className="rb-mark" style={{ left: `${scalePos("ph", ph)}%` }} />}
          </div>
        </div>
        <span className="st">
          {stale ?? (pw && (<><Dot tone={pw.tone} />{pw.word}</>))}
        </span>
      </div>
      <div className="row">
        <span className="k">Turbidity</span>
        <div>
          <span className="v">
            {fmtNtu(ntu)}
            <small>NTU</small>
          </span>
          <div className="rb" aria-hidden="true">
            <div className="rb-band" style={{ left: 0, width: `${scalePos("ntu", device.ntu_max)}%` }} />
            {ntu !== null && <div className="rb-mark" style={{ left: `${scalePos("ntu", ntu)}%` }} />}
          </div>
        </div>
        <span className="st">
          {stale ?? (nw && (<><Dot tone={nw.tone} />{nw.word}</>))}
        </span>
      </div>
    </div>
  );
}

/** Switch, sample buttons and unplug for the virtual board, with an honest note about what it is. */
export function VirtualControls({ compact = false }: { compact?: boolean }) {
  const { device, virtual, isDemo } = useLive();
  if (!device) return null;
  const { mode, setEnabled, pour, unplug, pouring, unplugLeft } = virtual;
  const live = mode === "on";
  return (
    <div className={compact ? "vb" : undefined}>
      <div className="vb-head">
        <b id="vb-label">Virtual board</b>
        <button
          type="button"
          role="switch"
          className="switchbtn"
          aria-checked={mode === "on" || mode === "unplugged"}
          aria-labelledby="vb-label"
          disabled={mode === "board"}
          onClick={() => setEnabled(mode === "off")}
        />
      </div>
      <p>
        {mode === "board"
          ? "Your real board is sending readings, so the virtual board is paused."
          : mode === "off"
            ? "Off. Turn it on to simulate readings while this page is open, using the same rules as the board."
            : mode === "unplugged"
              ? `Unplugged. The app marks the board offline after 30 s, then it plugs back in after ${unplugLeft} s.`
              : "Makes a simulated reading every 2 s while this page is open, with the same stop and restart rules as the board. Try a bad sample:"}
      </p>
      {(live || mode === "unplugged") && (
        <div className="vb-acts">
          <button type="button" className="btn ghost sm" disabled={!live || pouring !== null} onClick={() => pour("ph")}>
            {pouring === "ph" ? "Pouring…" : "Pour a pH 9.18 buffer"}
          </button>
          <button type="button" className="btn ghost sm" disabled={!live || pouring !== null} onClick={() => pour("ntu")}>
            {pouring === "ntu" ? "Stirring…" : "Stir in mud"}
          </button>
          <button type="button" className="btn ghost sm" disabled={!live} onClick={unplug}>
            {mode === "unplugged" ? `Back in ${unplugLeft} s` : "Unplug the board"}
          </button>
        </div>
      )}
      {isDemo && <p className="simnote">This demo tank is shared, so other visitors may be pouring samples too.</p>}
    </div>
  );
}

/** Bucketed readings, summary numbers and pump stops for a range, refreshed while the page is open. */
export function useRangeData(device: Device | null, range: Range) {
  const { supabase } = useLive();
  const id = device?.id;
  // a stop opening or closing changes the summary and the chart, so a state change reloads at once
  const state = device?.state;
  const [data, setData] = useState<{
    key: string;
    from: number;
    to: number;
    series: SeriesPoint[];
    stats: Stats | null;
    stops: Stop[];
    stopEvents: DeviceEvent[];
  } | null>(null);
  // a slow answer to an older request must not overwrite a newer one
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!id) return;
    const mine = ++seq.current;
    const to = Date.now();
    const from = to - RANGES[range].ms;
    const fromIso = new Date(from).toISOString();
    const [s, st, ev] = await Promise.all([
      supabase.rpc("reading_series", { p_device: id, p_from: fromIso, p_bucket: RANGES[range].bucket }),
      supabase.rpc("reading_stats", { p_device: id, p_from: fromIso }),
      supabase
        .from("events")
        .select(EVENT_COLUMNS)
        .eq("device_id", id)
        .eq("kind", "stopped")
        .or(`ended_at.is.null,ended_at.gte.${fromIso}`)
        .order("at", { ascending: false })
        .limit(200),
    ]);
    if (mine !== seq.current) return;
    const stopEvents = (ev.data ?? []) as DeviceEvent[];
    const stats = (Array.isArray(st.data) ? st.data[0] : st.data) as Stats | null;
    setData({
      key: `${id}-${range}`,
      from,
      to,
      series: (s.data ?? []) as SeriesPoint[],
      stats: stats && stats.n ? stats : null,
      stops: stopEvents.map((e) => ({ from: Date.parse(e.at), to: e.ended_at ? Date.parse(e.ended_at) : to })),
      stopEvents,
    });
  }, [supabase, id, range]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, range === "1H" ? 10_000 : 30_000);
    return () => clearInterval(t);
  }, [load, range, state]);

  // the previous range stays on screen until the new one arrives, but only for the same tank
  return data && data.key.startsWith(`${id}-`) ? { ...data, fresh: data.key === `${id}-${range}`, reload: load } : null;
}

/** Adds the device's latest reading to the end of a series so the line reaches "now" between refreshes. */
export function withLive(series: SeriesPoint[], d: Device): SeriesPoint[] {
  if (!d.last_seen_at || d.last_ph === null || d.last_ntu === null) return series;
  const last = series[series.length - 1];
  if (last && Date.parse(last.t) >= Date.parse(d.last_seen_at)) return series;
  return [...series, { t: d.last_seen_at, ph: d.last_ph, ntu: d.last_ntu, n: 1 }];
}

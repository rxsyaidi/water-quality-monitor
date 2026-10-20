"use client";

// Simulated monitor. It runs the same rules the board will run (confirm for
// 2 s, stop the pump, restart after 30 s in range) on made up readings, so
// the portal can be tried before the real board is online.
import { useCallback, useEffect, useReducer, useState } from "react";
import { CONFIRM_MS, RESTART_MS, SAMPLE_MS, reason } from "./monitor";

export const HISTORY = 180; // 6 minutes at one reading every 2 s

export type Pump = "running" | "stopped" | "restarting";
export type Sample = { ph: number; ntu: number; stopped: boolean };
export type EventTone = "bad" | "ok" | "info";
export type MonitorEvent = { id: number; at: number; tone: EventTone; title: string; detail: string };
type Fault = { kind: "ph" | "ntu"; left: number } | null;

type State = {
  samples: Sample[];
  pump: Pump;
  outFor: number; // ms the reading has been out of range
  restartAt: number | null;
  fault: Fault;
  events: MonitorEvent[];
  lastAt: number | null;
  stops: number;
  seq: number;
};

type Action =
  | { type: "boot"; now: number }
  | { type: "tick"; now: number; n1: number; n2: number }
  | { type: "fault"; kind: "ph" | "ntu" };

// Seeded so the server and the browser draw the same first chart.
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646 - 0.5;
  };
}

function initial(): State {
  const r = seeded(11);
  let ph = 7.2;
  let ntu = 1.7;
  const samples: Sample[] = [];
  for (let i = 0; i < HISTORY; i++) {
    ph = Math.min(7.5, Math.max(6.95, ph + (7.2 - ph) * 0.08 + r() * 0.07));
    ntu = Math.min(2.6, Math.max(0.9, ntu + (1.7 - ntu) * 0.08 + r() * 0.2));
    samples.push({ ph: +ph.toFixed(2), ntu: +ntu.toFixed(2), stopped: false });
  }
  return { samples, pump: "running", outFor: 0, restartAt: null, fault: null, events: [], lastAt: null, stops: 0, seq: 0 };
}

function log(s: State, at: number, tone: EventTone, title: string, detail: string): Pick<State, "events" | "seq"> {
  return { events: [{ id: s.seq, at, tone, title, detail }, ...s.events].slice(0, 14), seq: s.seq + 1 };
}

function reducer(s: State, a: Action): State {
  if (a.type === "boot") {
    if (s.lastAt) return s;
    return { ...s, lastAt: a.now, ...log(s, a.now, "info", "Monitor online", "Simulated readings, every 2 s") };
  }
  if (a.type === "fault") {
    if (s.fault || s.pump !== "running") return s;
    return { ...s, fault: { kind: a.kind, left: 5 } };
  }

  const prev = s.samples[s.samples.length - 1];
  const f = s.fault;
  const k = f ? 0.75 : 0.25;
  const phTarget = f?.kind === "ph" ? 8.92 : 7.2;
  const ntuTarget = f?.kind === "ntu" ? 38 : 1.7;
  const ph = +(prev.ph + (phTarget - prev.ph) * k + a.n1 * 0.06).toFixed(2);
  const l = Math.log10(prev.ntu);
  const ntu = +Math.pow(10, l + (Math.log10(ntuTarget) - l) * k + a.n2 * 0.05).toFixed(2);
  const fault: Fault = f && f.left > 1 ? { ...f, left: f.left - 1 } : null;

  let next: State = { ...s, fault, lastAt: a.now };
  const why = reason(ph, ntu);

  if (why) {
    next.outFor = s.outFor + SAMPLE_MS;
    if (next.outFor >= CONFIRM_MS + SAMPLE_MS && s.pump !== "stopped") {
      next = { ...next, pump: "stopped", restartAt: null, stops: s.stops + 1 };
      next = { ...next, ...log(next, a.now, "bad", "Pump stopped", `${why}.`) };
      next = { ...next, ...log(next, a.now + 900, "info", "Alert sent", "Phone notification") };
    }
  } else {
    next.outFor = 0;
    if (s.pump === "stopped") {
      next = { ...next, pump: "restarting", restartAt: a.now + RESTART_MS };
      next = { ...next, ...log(next, a.now, "ok", "Back in range", `pH ${ph.toFixed(2)}, ${ntu.toFixed(1)} NTU`) };
    } else if (s.pump === "restarting" && s.restartAt && a.now >= s.restartAt) {
      next = { ...next, pump: "running", restartAt: null };
      next = { ...next, ...log(next, a.now, "ok", "Pump restarted", "After 30 s in range") };
    }
  }

  next.samples = [...s.samples.slice(1), { ph, ntu, stopped: next.pump === "stopped" }];
  return next;
}

export function useMonitor() {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    dispatch({ type: "boot", now: Date.now() });
    setNow(Date.now());
    const tick = setInterval(
      () => dispatch({ type: "tick", now: Date.now(), n1: Math.random() - 0.5, n2: Math.random() - 0.5 }),
      SAMPLE_MS,
    );
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(tick);
      clearInterval(clock);
    };
  }, []);

  const trigger = useCallback((kind: "ph" | "ntu") => dispatch({ type: "fault", kind }), []);
  const latest = state.samples[state.samples.length - 1];
  return { ...state, latest, now, trigger };
}

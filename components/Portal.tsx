"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowLeft, Bell, Cpu, Droplet, FlaskConical, LayoutGrid } from "lucide-react";
import { LineChart } from "./LineChart";
import { RangeBar } from "./RangeBar";
import { Logo, StatusDot } from "./ui";
import { CONFIRM_MS, LIMITS, RESTART_MS, SAMPLE_MS, fmt, phRange, reason, type Level } from "@/lib/monitor";
import { useMonitor, type MonitorEvent } from "@/lib/useMonitor";

const sections = [
  { id: "now", label: "Overview", short: "Now", icon: LayoutGrid, mobile: Droplet },
  { id: "history", label: "Readings", short: "History", icon: Activity, mobile: Activity },
  { id: "alerts", label: "Alarms", short: "Alerts", icon: Bell, mobile: Bell },
  { id: "tests", label: "Test runs", short: "Tests", icon: FlaskConical, mobile: FlaskConical },
  { id: "device", label: "Device", short: "Device", icon: Cpu, mobile: Cpu },
] as const;

const clock = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour12: false });
const X_LABELS = ["6 min ago", "4 min ago", "2 min ago", "now"];

function useActiveSection() {
  const [active, setActive] = useState("now");
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return active;
}

export function Portal() {
  const m = useMonitor();
  const active = useActiveSection();
  const { ph, ntu } = m.latest;
  const why = reason(ph, ntu);
  const lastStop = m.events.find((e) => e.tone === "bad")?.detail;
  const restartIn = m.restartAt && m.now ? Math.max(0, Math.ceil((m.restartAt - m.now) / 1000)) : RESTART_MS / 1000;

  let level: Level = "safe";
  let title = "Water is safe";
  let sub = "pH and turbidity are inside the limits. Pump running.";
  if (m.pump === "stopped") {
    level = "unsafe";
    title = "Pump stopped";
    sub = `${why ?? lastStop?.replace(/\.$/, "")}. The monitor cut the pump on its own.`;
  } else if (why) {
    level = "check";
    title = "Checking a reading";
    sub = `${why}. The monitor confirms for ${CONFIRM_MS / 1000} s before it acts.`;
  } else if (m.pump === "restarting") {
    level = "check";
    title = "Back in range";
    sub = `The pump restarts in ${restartIn} s if readings stay inside the limits.`;
  }

  const pumpWord = m.pump === "running" ? "Running" : m.pump === "stopped" ? "Stopped" : "Waiting to restart";
  const pumpLevel: Level = m.pump === "running" ? "safe" : m.pump === "stopped" ? "unsafe" : "check";
  const canTest = m.pump === "running" && !m.fault && !why;
  const stoppedFlags = m.samples.map((s) => s.stopped);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Sidebar, laptop */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-card px-3 py-5 lg:flex">
        <Link href="/" className="flex min-h-11 items-center gap-2 px-2 text-[15px] font-semibold">
          <Logo />
          Water Monitor
        </Link>
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Portal">
          {sections.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? "true" : undefined}
              className={`flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors duration-150 ${
                active === id ? "bg-brand-tint font-semibold text-brand" : "text-ink-2 hover:bg-ground hover:text-ink"
              }`}
            >
              <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {id === "alerts" && m.stops > 0 && (
                <span className="rounded-full bg-unsafe px-1.5 text-xs leading-5 font-semibold text-white">{m.stops}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-4 text-sm">
          <div className="px-2 font-medium">Monitor 01</div>
          <div className="mt-1 flex items-center gap-2 px-2 text-ink-2">
            <StatusDot level="safe" />
            Online, simulated
          </div>
          <Link
            href="/"
            className="mt-3 flex min-h-10 items-center gap-2 rounded-lg px-2 text-ink-2 transition-colors duration-150 hover:bg-ground hover:text-ink"
          >
            <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Project site
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Top bar, phone */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-card px-4 lg:hidden">
          <Link href="/" className="flex min-h-11 items-center gap-2 font-semibold">
            <Logo />
            Water Monitor
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center gap-1 text-sm text-ink-2">
            <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Project site
          </Link>
        </header>

        <main className="mx-auto max-w-[76rem] px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">
          {/* Overview */}
          <section id="now" aria-labelledby="now-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 id="now-title" className="text-2xl font-semibold tracking-[-0.01em]">
                  Tank A · Monitor 01
                </h1>
                <p className="mt-1 text-sm text-ink-2">
                  Reading every {SAMPLE_MS / 1000} s · last at{" "}
                  <span className="font-mono">{m.lastAt ? clock(m.lastAt) : "--:--:--"}</span>
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-sm text-ink-2">
                <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
                Simulated readings
              </span>
            </div>

            <div
              role="status"
              aria-live="polite"
              className={`mt-5 rounded-2xl px-5 py-4 transition-colors duration-300 ${
                level === "unsafe" ? "bg-unsafe-bg" : level === "check" ? "bg-check-bg" : "bg-card"
              }`}
            >
              <div
                className={`flex items-center gap-2.5 text-xl font-semibold ${
                  level === "unsafe" ? "text-unsafe" : level === "check" ? "text-check" : ""
                }`}
              >
                <StatusDot level={level} className="size-2.5" />
                {title}
              </div>
              <p className="mt-1 text-ink-2">{sub}</p>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Tile label="pH" hint={`limits ${phRange}`}>
                <Reading value={fmt("ph", ph)} out={ph < LIMITS.ph.min || ph > LIMITS.ph.max} />
                <RangeBar kind="ph" value={ph} />
              </Tile>
              <Tile label="Turbidity" hint={`limit ${LIMITS.ntu.max} NTU`}>
                <Reading value={fmt("ntu", ntu)} unit="NTU" out={ntu > LIMITS.ntu.max} />
                <RangeBar kind="ntu" value={ntu} />
              </Tile>
              <Tile label="Pump" hint="relay D2">
                <div className="mt-3 flex items-center gap-2 text-2xl font-medium">
                  <StatusDot level={pumpLevel} className="size-2.5" />
                  {pumpWord}
                </div>
                <p className="mt-2 text-sm text-ink-2">
                  Controlled by the monitor · {m.stops} {m.stops === 1 ? "stop" : "stops"} this session
                </p>
              </Tile>
              <Tile label="Instrument" hint="Monitor 01">
                <div className="mt-3 flex items-center gap-2 text-2xl font-medium">
                  <StatusDot level="safe" className="size-2.5" />
                  Online
                </div>
                <p className="mt-2 text-sm text-ink-2">Simulated in the browser until the board is connected.</p>
              </Tile>
            </div>

            <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-line bg-card px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold">Test the safety logic</h2>
                <p className="mt-0.5 text-sm text-ink-2">
                  {canTest
                    ? `The monitor confirms a bad reading for ${CONFIRM_MS / 1000} s, stops the pump, then restarts it after ${RESTART_MS / 1000} s back in range.`
                    : "Wait until the pump is running again to start another test."}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <TestButton disabled={!canTest} onClick={() => m.trigger("ph")}>
                  Push pH to 8.9
                </TestButton>
                <TestButton disabled={!canTest} onClick={() => m.trigger("ntu")}>
                  Add muddy water
                </TestButton>
              </div>
            </div>
          </section>

          {/* Readings and alarms */}
          <div className="mt-10 grid gap-4 xl:grid-cols-[1fr_22rem]">
            <section id="history" aria-labelledby="history-title" className="rounded-2xl border border-line bg-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="history-title" className="font-semibold">
                  Last 6 minutes
                </h2>
                <p className="flex items-center gap-4 text-sm text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-4 rounded-sm bg-safe-band" aria-hidden="true" />
                    safe range
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-4 rounded-sm bg-unsafe-bg" aria-hidden="true" />
                    pump off
                  </span>
                </p>
              </div>
              <h3 className="mt-5 text-sm text-ink-2">pH</h3>
              <div className="mt-1">
                <LineChart kind="ph" data={m.samples.map((s) => s.ph)} stopped={stoppedFlags} height={170} xLabels={X_LABELS} />
              </div>
              <h3 className="mt-5 text-sm text-ink-2">Turbidity, NTU (log scale)</h3>
              <div className="mt-1">
                <LineChart kind="ntu" data={m.samples.map((s) => s.ntu)} stopped={stoppedFlags} height={130} xLabels={X_LABELS} />
              </div>
            </section>

            <section id="alerts" aria-labelledby="alerts-title" className="rounded-2xl border border-line bg-card p-5">
              <h2 id="alerts-title" className="font-semibold">
                Events
              </h2>
              {m.events.length === 0 ? (
                <p className="mt-3 text-sm text-ink-2">Connecting to the monitor.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line-2">
                  {m.events.map((e) => (
                    <EventRow key={e.id} e={e} />
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Test runs */}
          <section id="tests" aria-labelledby="tests-title" className="mt-10">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="tests-title" className="text-xl font-semibold">
                Test runs
              </h2>
              <span className="inline-flex items-center gap-2 rounded-full bg-check-bg px-3 py-0.5 text-sm font-medium text-check">
                <span className="size-2 rounded-full bg-check" aria-hidden="true" />
                Not run yet
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-2">
              Method: 3 samples × 3 runs. Each run will link to its raw readings so every number in the report can be
              traced.
            </p>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card">
              <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="text-ink-2">
                    {["Run", "Sample", "Expected", "Pump did", "Response", "Result"].map((h) => (
                      <th key={h} scope="col" className="border-b border-line px-4 py-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {["A", "B", "C"].flatMap((g) =>
                    [1, 2, 3].map((n) => (
                      <tr key={g + n} className="border-b border-line-2 last:border-0">
                        <td className="px-4 py-2.5 font-semibold">
                          {g}
                          {n}
                        </td>
                        <td className="px-4 py-2.5">{g === "A" ? "Tap water" : g === "B" ? "pH 9 solution" : "Muddy water"}</td>
                        <td className="px-4 py-2.5">{g === "A" ? "Run" : "Stop"}</td>
                        <td className="px-4 py-2.5 text-faint">Pending</td>
                        <td className="px-4 py-2.5 text-faint">Pending</td>
                        <td className="px-4 py-2.5 text-faint">Pending</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Device */}
          <section id="device" aria-labelledby="device-title" className="mt-10">
            <h2 id="device-title" className="text-xl font-semibold">
              Device
            </h2>
            <dl className="mt-4 grid gap-x-8 rounded-2xl border border-line bg-card px-5 sm:grid-cols-2">
              {[
                ["Board", "Arduino UNO R4 WiFi"],
                ["Connection", "Simulated in this browser"],
                ["pH probe", "Analog pin A0"],
                ["Turbidity sensor", "Analog pin A1"],
                ["Pump relay", "Digital pin D2, 12 V pump"],
                ["Display", "LCD 16×2 over I2C"],
                ["Sample rate", `Every ${SAMPLE_MS / 1000} s`],
                ["Limits", `pH ${phRange}, at most ${LIMITS.ntu.max} NTU`],
                ["Stop rule", `Out of range for ${CONFIRM_MS / 1000} s`],
                ["Restart rule", `${RESTART_MS / 1000} s back in range`],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 border-b border-line-2 py-3 text-sm">
                  <dt className="text-ink-2">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </main>

        {/* Tab bar, phone */}
        <nav
          aria-label="Portal"
          className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {sections.map(({ id, short, mobile: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? "true" : undefined}
              className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors duration-150 ${
                active === id ? "font-semibold text-brand" : "text-faint"
              }`}
            >
              <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
              {short}
              {id === "alerts" && m.stops > 0 && (
                <span className="absolute top-2 left-[calc(50%+6px)] size-2 rounded-full bg-unsafe" aria-label={`${m.stops} alarms`} />
              )}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

function Tile({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card px-5 pt-4 pb-4">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-faint">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function Reading({ value, unit, out }: { value: string; unit?: string; out: boolean }) {
  return (
    <div className={`mt-1.5 text-5xl leading-none font-light tracking-[-0.02em] ${out ? "text-unsafe" : ""}`}>
      {value}
      {unit && <span className="ml-1.5 text-base font-normal tracking-normal text-ink-2">{unit}</span>}
    </div>
  );
}

function TestButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-11 items-center rounded-[10px] border border-line bg-card px-4 text-[15px] font-semibold text-ink transition-[border-color,transform,color] duration-150 ease-out hover:border-faint active:scale-[0.96] disabled:cursor-not-allowed disabled:border-line-2 disabled:text-off disabled:active:scale-100"
    >
      {children}
    </button>
  );
}

const tone: Record<MonitorEvent["tone"], Level> = { bad: "unsafe", ok: "safe", info: "offline" };

function EventRow({ e }: { e: MonitorEvent }) {
  return (
    <li className="flex gap-3 py-3 text-sm">
      <StatusDot level={tone[e.tone]} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{e.title}</div>
        <div className="text-ink-2">{e.detail}</div>
      </div>
      <span className="font-mono text-xs leading-5 text-ink-2">{clock(e.at)}</span>
    </li>
  );
}

"use client";

// Overview, comp C "Timeline hero": the state of the tank in one word or one alarm on water blue, the
// line behind it, then a white sheet with the range in a sentence, the readings and what the board did.
import Link from "next/link";
import { useState } from "react";
import { useLive } from "./Live";
import { ChartLegend, WaterChart, type Metric } from "./WaterChart";
import {
  Dot,
  DeviceSwitcher,
  RANGE_NAMES,
  RANGE_OPTIONS,
  ReadingRows,
  Seg,
  Timeline,
  VirtualControls,
  eventItem,
  sourceWord,
  useRangeData,
  withLive,
  type TimelineItem,
} from "./bits";
import {
  ago,
  clock,
  duration,
  fmtNtu,
  fmtPh,
  outReason,
  RANGES,
  when,
  type Device,
  type DeviceEvent,
  type Range,
  type Stats,
  type Status,
} from "@/lib/data";

const METRICS = [
  { value: "ph", label: "pH" },
  { value: "ntu", label: "Turbidity" },
] as const;

export function Overview() {
  const { device, status, now, events, virtual } = useLive();
  const [metric, setMetric] = useState<Metric>("ph");
  const [range, setRange] = useState<Range>("24H");
  const rd = useRangeData(device, range);

  if (!device) {
    return (
      <section className="hero">
        <div className="heroL">
          <div className="alarm off">
            <h1>
              <i className="dot" />
              No tank yet
            </h1>
            <p>Add a tank on the Device page to start.</p>
          </div>
        </div>
      </section>
    );
  }

  const to = now ?? rd?.to ?? 0;
  const from = to - RANGES[range].ms;
  const lastAt = device.last_seen_at ? Date.parse(device.last_seen_at) : null;
  const offlineSince = status === "offline" && lastAt ? lastAt : null;
  const openStop = events.find((e) => e.kind === "stopped" && !e.ended_at) ?? null;

  const items: TimelineItem[] = [];
  if (status === "offline" && lastAt && now) {
    items.push({
      key: "offline-now",
      at: now,
      title: "Board offline",
      detail: `No reading for ${ago(lastAt, now).replace(" ago", "")}, since ${clock(lastAt)}`,
      tone: "neutral",
    });
  }
  if (now) items.push(...events.slice(0, 6 - items.length).map((e) => eventItem(e, now)));

  return (
    <>
      <section className="hero">
        <div className="heroL">
          <div className="devrow">
            <DeviceSwitcher />
            <span>{sourceWord(device)}</span>
            {now && lastAt && (
              <span>{status === "offline" ? `Last reading ${clock(lastAt)}` : `Updated ${ago(lastAt, now)}`}</span>
            )}
          </div>
          <HeroState device={device} status={status} now={now} virtualMode={virtual.mode} unplugLeft={virtual.unplugLeft} />
          <dl className="status">
            <div>
              <dt>Pump</dt>
              <dd>
                {status === "offline" || status === "waiting" || device.pump_on === null ? (
                  "Unknown"
                ) : device.pump_on ? (
                  <>
                    <Dot tone="safe" water />
                    Running
                  </>
                ) : (
                  <>
                    <Dot tone="unsafe" water />
                    Stopped
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt>Board</dt>
              <dd>
                {status === "waiting" ? (
                  "Not yet"
                ) : status === "offline" ? (
                  <>
                    <Dot tone="neutral" water />
                    Offline
                  </>
                ) : (
                  <>
                    <Dot tone="safe" water />
                    Online
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt>Last reading</dt>
              <dd>{now && lastAt ? ago(lastAt, now) : "None yet"}</dd>
            </div>
          </dl>
        </div>
        <div>
          <div className="switch">
            <Seg options={METRICS} value={metric} onChange={setMetric} label="Reading" />
            <Seg options={RANGE_OPTIONS} value={range} onChange={setRange} label="Time range" />
          </div>
          <WaterChart
            metric={metric}
            device={device}
            series={rd ? withLive(rd.series, device) : []}
            stops={rd?.stops ?? []}
            range={range}
            from={from}
            to={to}
            offlineSince={offlineSince}
          />
          <ChartLegend gap={status === "offline"} />
        </div>
      </section>

      <section className="sheet">
        <div>
          <h2 className="h">{RANGE_NAMES[range]}</h2>
          <p className="summary">
            {now && rd?.fresh ? (
              <Summary device={device} status={status} now={now} from={from} range={range} stats={rd.stats} stops={rd.stopEvents} openStop={openStop} events={events} />
            ) : (
              "Loading readings…"
            )}
          </p>
          <ReadingRows device={device} status={status} now={now} />
        </div>
        <div>
          <div className="evHead">
            <h2 className="h">What the board did</h2>
            <Link className="link" href="/app/alerts">
              All alerts
            </Link>
          </div>
          {now && items.length > 0 ? (
            <Timeline items={items} now={now} />
          ) : (
            <p className="summary">{now ? "Nothing yet. Stops, checks and restarts show up here." : "Loading…"}</p>
          )}
        </div>
        <VirtualControls compact />
      </section>
    </>
  );
}

function HeroState({
  device: d,
  status,
  now,
  virtualMode,
  unplugLeft,
}: {
  device: Device;
  status: Status;
  now: number | null;
  virtualMode: string;
  unplugLeft: number | null;
}) {
  const ph = d.last_ph ?? 0;
  const ntu = d.last_ntu ?? 0;
  const why = d.last_ph !== null && d.last_ntu !== null ? outReason(d, ph, ntu) : null;
  // seconds left on the confirm or restart clock, counted from when the record entered this state
  const limit = status === "checking" ? d.confirm_s : d.restart_s;
  // clamped to the limit, since this device's clock can run a little behind the server's
  const left = d.state_since && now ? Math.min(limit, Math.max(0, Math.ceil(limit - (now - Date.parse(d.state_since)) / 1000))) : null;

  if (status === "safe") {
    return (
      <div>
        <h1 className="big">
          <i className="dot w-safe" aria-hidden="true" />
          Safe
        </h1>
        <p className="lede">
          pH {fmtPh(d.last_ph)} and turbidity {fmtNtu(d.last_ntu)} NTU, both inside the limits.
        </p>
      </div>
    );
  }
  if (status === "checking") {
    return (
      <div className="alarm check" role="status">
        <h1>
          <i className="dot" />
          Checking
        </h1>
        <p>
          {why ?? "A reading left the range"}.{" "}
          {left === null ? (
            `The pump stops if it stays out for ${d.confirm_s} s.`
          ) : left > 0 ? (
            <>
              The pump stops in <span className="count">{left}</span> s if it stays out.
            </>
          ) : (
            "Stopping the pump now."
          )}
        </p>
      </div>
    );
  }
  if (status === "restarting") {
    return (
      <div className="alarm check" role="status">
        <h1>
          <i className="dot" />
          Restarting
        </h1>
        <p>
          {left === null ? (
            `Back in range. The pump restarts after ${d.restart_s} s if the readings stay in range.`
          ) : left > 0 ? (
            <>
              Back in range. The pump restarts in <span className="count">{left}</span> s if the readings stay in range.
            </>
          ) : (
            "Back in range. Restarting the pump now."
          )}
        </p>
      </div>
    );
  }
  if (status === "stopped") {
    return (
      <div className="alarm" role="alert">
        <h1>
          <i className="dot" />
          Pump stopped
        </h1>
        <p>
          {why ?? "The water left the safe range"}. The pump restarts after {d.restart_s} s back in range.
        </p>
      </div>
    );
  }
  if (status === "offline") {
    const lastAt = d.last_seen_at ? Date.parse(d.last_seen_at) : null;
    let help = "Check the board's power and Wi-Fi.";
    if (d.last_source === "virtual") {
      help =
        virtualMode === "unplugged"
          ? `You unplugged the virtual board. It plugs back in after ${unplugLeft} s.`
          : virtualMode === "off"
            ? "The virtual board is off. Turn it on below, or connect a real board."
            : "The virtual board only runs while this page is open.";
    }
    return (
      <div className="alarm off" role="status">
        <h1>
          <i className="dot" />
          Board offline
        </h1>
        <p>
          {lastAt && now ? `No reading for ${ago(lastAt, now).replace(" ago", "")}, since ${clock(lastAt)}. ` : ""}
          {help}
        </p>
      </div>
    );
  }
  return (
    <div className="alarm off" role="status">
      <h1>
        <i className="dot" />
        Waiting for readings
      </h1>
      <p>No board has sent a reading yet. Turn on the virtual board below, or connect your board on the Device page.</p>
    </div>
  );
}

function Summary({
  device: d,
  status,
  now,
  from,
  range,
  stats,
  stops,
  openStop,
  events,
}: {
  device: Device;
  status: Status;
  now: number;
  from: number;
  range: Range;
  stats: Stats | null;
  stops: DeviceEvent[];
  openStop: DeviceEvent | null;
  events: DeviceEvent[];
}) {
  if (status === "waiting") return <>No readings yet.</>;
  const inRange = stops.filter((e) => Date.parse(e.at) >= from);
  const lastStop = inRange[0];
  // the live timeline can be ahead of the range data, so a restart it already shows wins over "still off"
  const restartedAt =
    lastStop &&
    (lastStop.ended_at ?? events.find((e) => e.kind === "restarted" && Date.parse(e.at) >= Date.parse(lastStop.at))?.at ?? null);

  const stopLine = !stats ? (
    <>No readings in this range.</>
  ) : inRange.length === 0 ? (
    <>
      No pump stops. pH stayed between <b>{fmtPh(stats.ph_min)}</b> and <b>{fmtPh(stats.ph_max)}</b>, and turbidity
      peaked at <b>{fmtNtu(stats.ntu_max)} NTU</b>.
    </>
  ) : (
    <>
      The pump stopped <b>{inRange.length === 1 ? "once" : `${inRange.length} times`}</b>, last at{" "}
      <b>{when(lastStop.at, now)}</b>
      {restartedAt
        ? `, and restarted ${duration(Date.parse(restartedAt) - Date.parse(lastStop.at))} later`
        : ", and it is still off"}
      .
      {stats.in_range_pct !== null && (
        <>
          {" "}
          Readings were in range <b>{Number(stats.in_range_pct).toFixed(Number(stats.in_range_pct) >= 99.95 ? 0 : 1)}%</b> of the time.
        </>
      )}
    </>
  );

  if (status === "stopped" && openStop) {
    return (
      <>
        The pump has been off since <b>{when(openStop.at, now)}</b>, because {lowerFirst(openStop.detail)}. It restarts after{" "}
        {d.restart_s} s back in range.{" "}
        {inRange.length > 1 && (
          <>
            That is stop {inRange.length} in the {RANGE_NAMES[range].toLowerCase()}.
          </>
        )}
      </>
    );
  }
  if (status === "offline" && d.last_seen_at) {
    return (
      <>
        The board sent its last reading at <b>{when(d.last_seen_at, now)}</b>, {ago(d.last_seen_at, now)}. {stopLine}
      </>
    );
  }
  return stopLine;
}

const lowerFirst = (s: string) => (s.startsWith("pH") ? s : s.charAt(0).toLowerCase() + s.slice(1));

"use client";

// History: both readings over a range on white, their numbers, every pump stop, and a CSV for the report.
import { useState } from "react";
import { useLive } from "./Live";
import { ChartLegend, WaterChart } from "./WaterChart";
import { Icon } from "./icons";
import { PageHead, RANGE_NAMES, RANGE_OPTIONS, Seg, useRangeData, withLive } from "./bits";
import { clock, dayLabel, duration, fmtLimit, fmtNtu, fmtPh, RANGES, type Range } from "@/lib/data";

/** "pH 9.02 is above the 8.5 limit" becomes "pH 9.02, over 8.5" for a phone column. */
const shortWhy = (s: string) =>
  s.replace(/^(.*?) is (above|below) the (.*?) limit$/, (_m, what, dir, lim) => `${what}, ${dir === "above" ? "over" : "under"} ${lim}`);

export function History() {
  const { device, status, now } = useLive();
  const [range, setRange] = useState<Range>("24H");
  const rd = useRangeData(device, range);
  if (!device) return <PageHead title="History" sub="Add a tank on the Device page first." />;

  const to = now ?? rd?.to ?? 0;
  const from = to - RANGES[range].ms;
  const offlineSince = status === "offline" && device.last_seen_at ? Date.parse(device.last_seen_at) : null;
  const series = rd ? withLive(rd.series, device) : [];
  const s = rd?.fresh ? rd.stats : null;
  const stops = (rd?.stopEvents ?? []).filter((e) => Date.parse(e.at) >= from);

  const chart = (metric: "ph" | "ntu") => (
    <section className="panel">
      <div className="panel-head">
        <h2 className="h">{metric === "ph" ? "pH" : "Turbidity"}</h2>
        <span className="panel-sub" style={{ marginTop: 0 }}>
          {metric === "ph" ? `Safe ${fmtLimit(device.ph_min)} to ${fmtLimit(device.ph_max)}` : `Safe up to ${fmtLimit(device.ntu_max)} NTU`}
        </span>
      </div>
      <div style={{ marginTop: 14 }}>
        <WaterChart
          metric={metric}
          device={device}
          series={series}
          stops={rd?.stops ?? []}
          range={range}
          from={from}
          to={to}
          offlineSince={offlineSince}
          variant="light"
          height={200}
        />
        <ChartLegend variant="light" gap={offlineSince !== null} />
      </div>
      <dl className="stats">
        {(["min", "avg", "max"] as const).map((k) => {
          const v = s ? (s[`${metric}_${k}` as keyof typeof s] as number) : null;
          return (
            <div key={k}>
              <dt>{k === "min" ? "Lowest" : k === "avg" ? "Average" : "Highest"}</dt>
              <dd>
                {v === null ? "–" : metric === "ph" ? fmtPh(v) : fmtNtu(v)}
                {metric === "ntu" && v !== null && <small>NTU</small>}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );

  return (
    <>
      <PageHead title="History" sub="Readings and pump stops over time, and the data for your report." />
      <div className="pg-body">
        <section className="panel">
          <div className="panel-head">
            <Seg options={RANGE_OPTIONS} value={range} onChange={setRange} label="Time range" light />
            <a
              className="btn ghost sm"
              href={`/app/history/export?device=${device.id}&range=${range}`}
              download
            >
              <Icon name="download" size={18} />
              Download CSV
            </a>
          </div>
          <p className="summary">
            {!rd?.fresh ? (
              "Loading readings…"
            ) : !s ? (
              `No readings in the ${RANGE_NAMES[range].toLowerCase()}.`
            ) : (
              <>
                {RANGE_NAMES[range]}: <b>{s.n.toLocaleString("en-GB")}</b> readings, in range{" "}
                <b>{s.in_range_pct === null ? "–" : `${Number(s.in_range_pct)}%`}</b> of the time, and{" "}
                <b>{stops.length === 0 ? "no pump stops" : stops.length === 1 ? "one pump stop" : `${stops.length} pump stops`}</b>.
              </>
            )}
          </p>
          {device.last_source === "virtual" && (
            <p className="simnote">
              Simulated history is stored one reading a minute for the last day and one every 10 minutes before that. Live
              readings come every 2 s.
            </p>
          )}
        </section>
        <div className="cols">
          {chart("ph")}
          {chart("ntu")}
        </div>
        <section className="panel">
          <h2 className="h">Pump stops</h2>
          {stops.length === 0 ? (
            <p className="panel-sub">{rd?.fresh ? "None in this range." : "Loading…"}</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Why</th>
                  <th scope="col">Off for</th>
                </tr>
              </thead>
              <tbody>
                {stops.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className="mono">{clock(e.at)}</span>
                      {now && dayLabel(e.at, now) !== "Today" && <small>{dayLabel(e.at, now)}</small>}
                    </td>
                    <td>
                      <span className="only-desk">{e.detail}</span>
                      <span className="only-phone">{shortWhy(e.detail)}</span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {e.ended_at ? duration(Date.parse(e.ended_at) - Date.parse(e.at)) : now ? `${duration(now - Date.parse(e.at))}, still off` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

"use client";

// Calibration: put the probe in each buffer, capture its voltage, and the app fits pH = slope × V + offset
// (least squares, same formula as the sketch). Turbidity needs one point: the voltage in clear water.
// With the real board the voltage is the average of its last 10 s; with the virtual board it is simulated.
import { useCallback, useEffect, useState } from "react";
import { useLive } from "./Live";
import { Dot, PageHead } from "./bits";
import { when, type Calibration as Cal } from "@/lib/data";

const BUFFERS = [4.01, 6.86, 9.18];
// the simulated probe: a slightly different response from the default, so calibrating visibly changes it
const SIM = { slope: 3.42, offset: 0.12, clear: 4.12 };
const noise = () => (Math.random() - 0.5) * 0.008;

export function Calibration() {
  const { supabase, device, now, virtual, mergeDevice } = useLive();
  const [points, setPoints] = useState<Record<number, number>>({});
  const [clear, setClear] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [history, setHistory] = useState<Cal[] | null>(null);
  const id = device?.id;
  const real = virtual.mode === "board";
  const canCapture = real || virtual.mode === "on";

  const loadHistory = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("calibrations")
      .select("id,at,sensor,points,ph_slope,ph_offset,clear_volt")
      .eq("device_id", id)
      .order("at", { ascending: false })
      .limit(10);
    setHistory((data ?? []) as Cal[]);
  }, [supabase, id]);

  useEffect(() => {
    setPoints({});
    setClear(null);
    setMsg(null);
    setHistory(null);
    loadHistory();
  }, [loadHistory]);

  if (!device) return <PageHead title="Calibration" sub="Add a tank on the Device page first." />;

  /** Average voltage the board sent over the last 10 s, or a simulated one. */
  async function volts(column: "ph_v" | "ntu_v", simulated: number) {
    if (!real) {
      await new Promise((r) => setTimeout(r, 900));
      return +(simulated + noise()).toFixed(3);
    }
    const { data } = await supabase
      .from("readings")
      .select(column)
      .eq("device_id", id!)
      .eq("source", "board")
      .gte("at", new Date(Date.now() - 10_000).toISOString());
    const vs = ((data ?? []) as Record<string, number | null>[]).map((r) => r[column]).filter((v): v is number => v !== null);
    return vs.length ? +(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(3) : null;
  }

  async function capturePh(ph: number) {
    setBusy(`ph-${ph}`);
    setMsg(null);
    const v = await volts("ph_v", (ph - SIM.offset) / SIM.slope);
    setBusy(null);
    if (v === null) return setMsg({ text: "No voltage from the board in the last 10 s. Check it is online, then capture again.", err: true });
    setPoints((p) => ({ ...p, [ph]: v }));
  }

  async function savePh() {
    const list = BUFFERS.filter((b) => points[b] !== undefined).map((ph) => ({ ph, v: points[ph] }));
    setBusy("save-ph");
    const { data, error } = await supabase.rpc("save_calibration", { p_device: id, p_sensor: "ph", p_points: list });
    setBusy(null);
    if (error) return setMsg({ text: error.message.replace(/^./, (c) => c.toUpperCase()) + ".", err: true });
    mergeDevice({ id: id!, ph_slope: data.ph_slope, ph_offset: data.ph_offset, calibrated_at: new Date().toISOString() });
    setPoints({});
    setMsg({ text: `Saved. pH = ${data.ph_slope.toFixed(3)} × V ${data.ph_offset < 0 ? "−" : "+"} ${Math.abs(data.ph_offset).toFixed(3)}. The board picks it up with its next reading.` });
    loadHistory();
  }

  async function captureClear() {
    setBusy("ntu");
    setMsg(null);
    const v = await volts("ntu_v", SIM.clear);
    setBusy(null);
    if (v === null) return setMsg({ text: "No voltage from the board in the last 10 s. Check it is online, then capture again.", err: true });
    setClear(v);
  }

  async function saveClear() {
    if (clear === null) return;
    setBusy("save-ntu");
    const { data, error } = await supabase.rpc("save_calibration", { p_device: id, p_sensor: "ntu", p_points: [{ v: clear }] });
    setBusy(null);
    if (error) return setMsg({ text: error.message.replace(/^./, (c) => c.toUpperCase()) + ".", err: true });
    mergeDevice({ id: id!, clear_volt: data.clear_volt, calibrated_at: new Date().toISOString() });
    setClear(null);
    setMsg({ text: `Saved. Clear water now reads ${data.clear_volt} V.` });
    loadHistory();
  }

  const captured = BUFFERS.filter((b) => points[b] !== undefined).length;
  const offset = Number(device.ph_offset);
  // three decimals everywhere, the same as the calibration event in Alerts
  const f3 = (n: number | string | null) => Number(n).toFixed(3);

  return (
    <>
      <PageHead title="Calibration" sub="Teach the app what the sensors read in water you know." />
      <div className="pg-body">
        <section className="panel">
          <div className="panel-head">
            <h2 className="h">pH probe</h2>
            <span className="panel-sub" style={{ marginTop: 0 }}>
              Now: pH = {f3(device.ph_slope)} × V {offset < 0 ? "−" : "+"} {f3(Math.abs(offset))}
            </span>
          </div>
          <p className="panel-sub">
            Rinse the probe, put it in each buffer, wait about 30 s for it to settle, then capture. Two buffers work; three are
            more accurate.
          </p>
          <div className="bufs">
            {BUFFERS.map((b) => (
              <div key={b} className={`buf${points[b] !== undefined ? " done" : ""}`}>
                <b>
                  {b}
                  <small>pH</small>
                </b>
                <span>{points[b] !== undefined ? `${points[b].toFixed(3)} V` : "Not captured"}</span>
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={!canCapture || busy !== null}
                  onClick={() => capturePh(b)}
                >
                  {busy === `ph-${b}` ? "Reading…" : points[b] !== undefined ? "Again" : "Capture"}
                </button>
              </div>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="btn" disabled={captured < 2 || busy !== null} onClick={savePh}>
              {busy === "save-ph" ? "Saving…" : captured < 2 ? `Capture ${2 - captured} more` : `Save with ${captured} buffers`}
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="h">Turbidity sensor</h2>
            <span className="panel-sub" style={{ marginTop: 0 }}>
              Now: clear water reads {Number(device.clear_volt)} V
            </span>
          </div>
          <p className="panel-sub">Put the sensor in clean tap or bottled water, keep it still and out of direct light, then capture.</p>
          <div className="actions">
            <button type="button" className="btn ghost" disabled={!canCapture || busy !== null} onClick={captureClear}>
              {busy === "ntu" ? "Reading…" : clear === null ? "Capture clear water" : "Capture again"}
            </button>
            {clear !== null && (
              <button type="button" className="btn" disabled={busy !== null} onClick={saveClear}>
                {busy === "save-ntu" ? "Saving…" : `Save ${clear.toFixed(3)} V`}
              </button>
            )}
          </div>
        </section>

        {(msg || !canCapture || !real) && (
          <section className="panel">
            {!canCapture ? (
              <p className="note">
                <b>Nothing to read from.</b> Connect the real board on the Device page, or turn the virtual board on, to capture
                voltages.
              </p>
            ) : (
              !real && (
                <p className="note">
                  <b>Simulated voltages.</b> No real board is online, so the virtual board makes them up from a typical probe. Use
                  this to learn the steps; calibrate again with the real sensors before trusting the readings.
                </p>
              )
            )}
            {msg && (
              <p className={`msg${msg.err ? " err" : ""}`} role={msg.err ? "alert" : "status"}>
                <Dot tone={msg.err ? "unsafe" : "safe"} />
                {msg.text}
              </p>
            )}
          </section>
        )}

        <section className="panel">
          <h2 className="h">Past calibrations</h2>
          {!history ? (
            <p className="panel-sub">Loading…</p>
          ) : history.length === 0 ? (
            <p className="panel-sub">None yet. The board uses the sketch’s starting values until you calibrate.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Sensor</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {history.map((c) => (
                  <tr key={c.id}>
                    <td>{now ? when(c.at, now) : ""}</td>
                    <td>
                      {c.sensor === "ph" ? "pH" : "Turbidity"}
                      <small>
                        {c.sensor === "ph"
                          ? c.points.map((p) => p.ph).join(", ")
                          : "Clear water"}
                      </small>
                    </td>
                    <td>
                      {c.sensor === "ph"
                        ? `Slope ${f3(c.ph_slope)}, offset ${f3(c.ph_offset)}`
                        : `${Number(c.clear_volt)} V`}
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

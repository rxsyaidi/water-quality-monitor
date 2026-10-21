"use client";

// Test runs: the bench tests for the report. Start a run for a sample, say what should happen, pour it
// (or simulate it), finish, and the app checks the readings and stops in that window against the
// expectation. Results copy as text or download as CSV.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLive } from "./Live";
import { Dot, PageHead } from "./bits";
import { clock, duration, fmtNtu, fmtPh, when, type Fault, type Stats, type TestRun } from "@/lib/data";

type Preset = { sample: string; expect: TestRun["expect"]; note: string; fault: Fault | null };
const PRESETS: Preset[] = [
  { sample: "Tap water", expect: "runs", note: "Clear and near neutral", fault: null },
  { sample: "pH 9.18 buffer", expect: "stops", note: "Above the pH limit", fault: "ph" },
  { sample: "Muddy water", expect: "stops", note: "Above the turbidity limit", fault: "ntu" },
];
const EXPECT_WORDS = { runs: "Pump keeps running", stops: "Pump stops" } as const;

/** What a run was tested on, so a simulated result is never mistaken for a bench test on the board. */
function sourceOf(stats: Stats | null) {
  if (!stats) return "No readings";
  if (!stats.board_n) return "Simulated readings";
  return stats.board_n === stats.n ? "Real board readings" : "Real board and simulated readings";
}

type Result = TestRun & { stats: Stats | null; stops: number; matched: boolean };

export function Tests() {
  const { supabase, device, status, now, virtual } = useLive();
  const [runs, setRuns] = useState<Result[] | null>(null);
  const [active, setActive] = useState<TestRun | null>(null);
  const [notes, setNotes] = useState("");
  const [custom, setCustom] = useState({ sample: "", expect: "runs" as TestRun["expect"] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const id = device?.id;

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("test_runs")
      .select("id,sample,expect,started_at,ended_at,notes")
      .eq("device_id", id)
      .order("started_at", { ascending: false })
      .limit(20);
    const list = (data ?? []) as TestRun[];
    setActive(list.find((r) => !r.ended_at) ?? null);
    const done = list.filter((r) => r.ended_at);
    const results = await Promise.all(
      done.map(async (r): Promise<Result> => {
        // any stop that overlaps the run counts, including one that began just before it
        const [st, ev] = await Promise.all([
          supabase.rpc("reading_stats", { p_device: id, p_from: r.started_at, p_to: r.ended_at }),
          supabase
            .from("events")
            .select("id")
            .eq("device_id", id)
            .eq("kind", "stopped")
            .lte("at", r.ended_at!)
            .or(`ended_at.is.null,ended_at.gte.${new Date(r.started_at).toISOString()}`),
        ]);
        const stats = ((Array.isArray(st.data) ? st.data[0] : st.data) as Stats | null) ?? null;
        const stops = (ev.data ?? []).length;
        return { ...r, stats: stats?.n ? stats : null, stops, matched: (stops > 0) === (r.expect === "stops") };
      }),
    );
    setRuns(results);
  }, [supabase, id]);

  useEffect(() => {
    setRuns(null);
    load();
  }, [load]);

  if (!device) return <PageHead title="Test runs" sub="Add a tank on the Device page first." />;

  async function start(sample: string, expect: TestRun["expect"]) {
    if (!sample.trim()) return setMsg({ text: "Name the sample first, like “Pond water”.", err: true });
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("test_runs").insert({ device_id: id, sample: sample.trim(), expect });
    setBusy(false);
    if (error) return setMsg({ text: "Could not start the run. Try again.", err: true });
    setNotes("");
    setCustom({ sample: "", expect: "runs" });
    load();
  }

  async function discard() {
    if (!active) return;
    setBusy(true);
    const { error } = await supabase.from("test_runs").delete().eq("id", active.id);
    setBusy(false);
    if (error) return setMsg({ text: "Could not discard the run. Try again.", err: true });
    setMsg({ text: `Discarded “${active.sample}”.` });
    load();
  }

  async function finish() {
    if (!active) return;
    setBusy(true);
    const { error } = await supabase
      .from("test_runs")
      .update({ ended_at: new Date().toISOString(), notes: notes.trim() || null })
      .eq("id", active.id);
    setBusy(false);
    if (error) return setMsg({ text: "Could not finish the run. Try again.", err: true });
    setMsg({ text: `Saved “${active.sample}”. The result is below.` });
    load();
  }

  const rowsText = (runs ?? []).map((r) => ({
    sample: r.sample,
    expected: EXPECT_WORDS[r.expect],
    happened: r.stops > 0 ? `Pump stopped${r.stops > 1 ? ` ${r.stops} times` : ""}` : "Pump kept running",
    ph: r.stats ? `${fmtPh(r.stats.ph_min)} to ${fmtPh(r.stats.ph_max)}` : "",
    ntu: r.stats ? fmtNtu(r.stats.ntu_max) : "",
    result: r.matched ? "Matched" : "Did not match",
    source: sourceOf(r.stats),
    when: new Date(r.started_at).toLocaleString("en-GB"),
    length: duration(Date.parse(r.ended_at!) - Date.parse(r.started_at)),
    notes: r.notes ?? "",
  }));

  async function copy() {
    const text = rowsText
      .map((r) => `${r.sample}: expected “${r.expected}”, ${r.happened.toLowerCase()} (pH ${r.ph}, up to ${r.ntu} NTU). ${r.result}. ${r.source}.`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ text: "Copied the results." });
    } catch {
      setMsg({ text: "Copying is blocked in this browser. Use Download CSV instead.", err: true });
    }
  }

  function csv() {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const head = "sample,expected,what_happened,ph_range,turbidity_max_ntu,result,source,started,length,notes";
    const body = rowsText.map((r) => [r.sample, r.expected, r.happened, r.ph, r.ntu, r.result, r.source, r.when, r.length, r.notes].map(esc).join(","));
    const url = URL.createObjectURL(new Blob([[head, ...body].join("\n") + "\n"], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "test-runs.csv" });
    a.click();
    URL.revokeObjectURL(url);
  }

  const preset = active ? PRESETS.find((p) => p.sample === active.sample) : null;
  // a run only starts from clean water with the pump running, so its result is the sample's alone
  // nor while a simulated sample is still being poured, which would land in the new run
  const ready = status === "safe" && virtual.pouring === null;
  const noBoard = status === "offline" || status === "waiting";
  // a run left open on the shared demo would otherwise greet every visitor as "Running"
  const left = active && now ? now - Date.parse(active.started_at) > 15 * 60_000 : false;
  const canPour = !!preset?.fault && virtual.mode === "on";

  return (
    <>
      <PageHead title="Test runs" sub="Bench tests for the report: pour a sample, then check the pump did what it should." />
      <div className="pg-body">
        <section className="panel">
          {active ? (
            <>
              <h2 className="h">{left ? "Left open" : "Running"}: {active.sample}</h2>
              {left && <p className="panel-sub">Nobody finished this run. Discard it, or finish it if the sample really was in the tank all this time.</p>}
              <div className="runcard">
                <div className="panel-head">
                  <span className="panel-sub" style={{ marginTop: 0 }}>
                    Started {clock(active.started_at)}
                    {now ? `, ${duration(now - Date.parse(active.started_at))} ago` : ""}
                  </span>
                  <span className="panel-sub" style={{ marginTop: 0 }}>
                    Expect: <b style={{ color: "var(--ink)", fontWeight: 500 }}>{EXPECT_WORDS[active.expect]}</b>
                  </span>
                </div>
                <div className="live">
                  <div>
                    pH<b>{fmtPh(device.last_ph)}</b>
                  </div>
                  <div>
                    Turbidity<b>{fmtNtu(device.last_ntu)} NTU</b>
                  </div>
                  <div>
                    Pump
                    <b style={{ display: "flex", gap: 7, alignItems: "center" }}>
                      {device.pump_on === null ? "–" : (
                        <>
                          <Dot tone={device.pump_on ? "safe" : "unsafe"} />
                          {device.pump_on ? "Running" : "Stopped"}
                        </>
                      )}
                    </b>
                  </div>
                </div>
                <label className="field" style={{ marginTop: 16 }}>
                  Notes
                  <textarea
                    value={notes}
                    maxLength={1000}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="What you saw, like how long the reading took to settle."
                  />
                </label>
                <div className="actions">
                  <button type="button" className="btn" disabled={busy} onClick={finish}>
                    Finish the run
                  </button>
                  <button type="button" className="btn ghost" disabled={busy} onClick={discard}>
                    Discard
                  </button>
                  {preset?.fault && (
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={!canPour || virtual.pouring !== null}
                      onClick={() => virtual.pour(preset.fault!)}
                    >
                      {virtual.pouring ? "Pouring…" : "Simulate this sample"}
                    </button>
                  )}
                </div>
                <p className="simnote">
                  {preset?.fault && virtual.mode !== "on"
                    ? "Pour the real sample now. Simulating needs the virtual board on."
                    : "Pour the sample, wait for the pump to react, then finish the run."}
                </p>
              </div>
            </>
          ) : (
            <>
              <h2 className="h">Start a run</h2>
              <p className="panel-sub">
                {ready ? (
                  "Pick the sample you are about to pour. The app records everything until you finish."
                ) : noBoard ? (
                  <>
                    No readings are coming in. Turn on the virtual board or connect the board on the{" "}
                    <Link className="link" href="/app/device">
                      Device
                    </Link>{" "}
                    page first.
                  </>
                ) : (
                  "Wait until the tank is Safe with the pump running, so the run starts from clean water."
                )}
              </p>
              <div className="presets">
                {PRESETS.map((p) => (
                  <button key={p.sample} type="button" className="preset" disabled={busy || !ready} onClick={() => start(p.sample, p.expect)}>
                    <b>{p.sample}</b>
                    <span>{p.note}</span>
                    <em>
                      <Dot tone={p.expect === "runs" ? "safe" : "unsafe"} />
                      {EXPECT_WORDS[p.expect]}
                    </em>
                  </button>
                ))}
              </div>
              <form
                className="form-grid two"
                onSubmit={(e) => {
                  e.preventDefault();
                  start(custom.sample, custom.expect);
                }}
              >
                <label className="field">
                  Another sample
                  <input
                    value={custom.sample}
                    maxLength={80}
                    onChange={(e) => setCustom({ ...custom, sample: e.target.value })}
                    placeholder="Pond water"
                  />
                </label>
                <label className="field">
                  It should
                  <select value={custom.expect} onChange={(e) => setCustom({ ...custom, expect: e.target.value as TestRun["expect"] })}>
                    <option value="runs">Keep the pump running</option>
                    <option value="stops">Stop the pump</option>
                  </select>
                </label>
                <div>
                  <button type="submit" className="btn ghost" disabled={busy || !ready}>
                    Start this run
                  </button>
                </div>
              </form>
            </>
          )}
          {msg && (
            <p className={`msg${msg.err ? " err" : ""}`} role={msg.err ? "alert" : "status"}>
              {msg.err && <Dot tone="unsafe" />}
              {msg.text}
            </p>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="h">Results</h2>
            {runs && runs.length > 0 && (
              <div className="actions" style={{ marginTop: 0 }}>
                <button type="button" className="btn ghost sm" onClick={copy}>
                  Copy
                </button>
                <button type="button" className="btn ghost sm" onClick={csv}>
                  Download CSV
                </button>
              </div>
            )}
          </div>
          {!runs ? (
            <p className="panel-sub">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="panel-sub">No finished runs yet. Each one you finish lands here with its result.</p>
          ) : (
            <table className="table runs">
              <thead>
                <tr>
                  <th scope="col">Sample</th>
                  <th scope="col">What happened</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.sample}
                      <small>{now ? when(r.started_at, now) : ""}</small>
                    </td>
                    <td>
                      {r.stops > 0 ? `Pump stopped${r.stops > 1 ? ` ${r.stops} times` : ""}` : "Pump kept running"}
                      <small>
                        {r.stats
                          ? `pH ${fmtPh(r.stats.ph_min)} to ${fmtPh(r.stats.ph_max)}, up to ${fmtNtu(r.stats.ntu_max)} NTU`
                          : "No readings in this run"}
                        {r.notes ? `. ${r.notes}` : ""}
                      </small>
                    </td>
                    <td>
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
                        <Dot tone={r.matched ? "safe" : "unsafe"} />
                        {r.matched ? "Matched" : "Did not match"}
                      </span>
                      <small>
                        Expected: {EXPECT_WORDS[r.expect].toLowerCase()}
                        <br />
                        {sourceOf(r.stats)}
                      </small>
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

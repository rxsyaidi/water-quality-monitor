"use client";

// Alerts: every event the board and the app recorded, newest first, grouped by day, with filters.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLive } from "./Live";
import { PageHead, Timeline, eventItem } from "./bits";
import { dayLabel, EVENT_COLUMNS, type DeviceEvent, type EventKind } from "@/lib/data";

const FILTERS: { key: string; label: string; kinds: EventKind[] | null }[] = [
  { key: "all", label: "All", kinds: null },
  { key: "pump", label: "Pump", kinds: ["stopped", "restarted", "back_in_range"] },
  { key: "checks", label: "Checks", kinds: ["checking", "false_alarm"] },
  { key: "board", label: "Board", kinds: ["offline", "connected"] },
  { key: "changes", label: "Settings", kinds: ["limits_changed", "calibrated"] },
];
const PAGE = 25;

export function Alerts() {
  const { supabase, device, now, events: latest } = useLive();
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<DeviceEvent[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const id = device?.id;
  const kinds = FILTERS.find((f) => f.key === filter)!.kinds;

  const fetchPage = useCallback(
    async (before?: string) => {
      if (!id) return [];
      let q = supabase.from("events").select(EVENT_COLUMNS).eq("device_id", id);
      if (kinds) q = q.in("kind", kinds);
      if (before) q = q.lt("at", before);
      const { data } = await q.order("at", { ascending: false }).limit(PAGE);
      return (data ?? []) as DeviceEvent[];
    },
    [supabase, id, kinds],
  );

  // reload the first page when the filter or tank changes, and when a new event arrives
  const head = latest[0]?.id;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    let live = true;
    fetchPage().then((r) => {
      if (!live) return;
      const prev = rowsRef.current;
      if (prev && prev.length > PAGE) {
        // older pages are open: refresh the rows already shown and add the new ones on top
        const fresh = new Map(r.map((e) => [e.id, e]));
        const known = new Set(prev.map((e) => e.id));
        setRows([...r.filter((e) => !known.has(e.id)), ...prev.map((e) => fresh.get(e.id) ?? e)]);
      } else {
        setRows(r);
        setMore(r.length === PAGE);
      }
    });
    return () => {
      live = false;
    };
  }, [fetchPage, head]);

  useEffect(() => setRows(null), [filter, id]);

  async function older() {
    if (!rows?.length) return;
    setLoadingMore(true);
    const r = await fetchPage(rows[rows.length - 1].at);
    setRows([...rows, ...r]);
    setMore(r.length === PAGE);
    setLoadingMore(false);
  }

  const groups: { day: string; items: DeviceEvent[] }[] = [];
  if (rows && now) {
    for (const e of rows) {
      const day = dayLabel(e.at, now);
      if (groups[groups.length - 1]?.day !== day) groups.push({ day, items: [] });
      groups[groups.length - 1].items.push(e);
    }
  }

  return (
    <>
      <PageHead title="Alerts" sub="Every stop, check, restart and change, newest first." />
      <div className="pg-body">
        <section className="panel">
          <div className="chips" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className="chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          {!rows || !now ? (
            <p className="panel-sub" style={{ marginTop: 16 }}>
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <p className="panel-sub" style={{ marginTop: 16 }}>
              {filter === "all" ? "Nothing yet. Stops, checks and restarts show up here." : "Nothing of this kind yet."}
            </p>
          ) : (
            <div style={{ marginTop: 8 }}>
              {groups.map((g) => (
                <div key={g.day}>
                  <h2 className="day">{g.day}</h2>
                  <Timeline items={g.items.map((e) => eventItem(e, now))} now={now} showDay={false} />
                </div>
              ))}
              {more && (
                <div className="actions">
                  <button type="button" className="btn ghost" disabled={loadingMore} onClick={older}>
                    {loadingMore ? "Loading…" : "Show older"}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

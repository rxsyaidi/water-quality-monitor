"use client";

// Live state for the signed in app: the tank being watched (kept fresh by Supabase Realtime with a
// 10 s poll behind it), its latest events, a clock for "2 s ago", and the virtual board's 2 s tick.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  DEVICE_COLUMNS,
  EVENT_COLUMNS,
  OFFLINE_S,
  SAMPLE_S,
  statusOf,
  type Device,
  type DeviceEvent,
  type Fault,
  type Status,
} from "@/lib/data";

export type VirtualMode = "on" | "off" | "board" | "unplugged";

type Live = {
  supabase: SupabaseClient;
  devices: Device[];
  device: Device | null;
  select: (id: string) => void;
  reloadDevices: () => Promise<void>;
  mergeDevice: (d: Partial<Device> & { id: string }) => void;
  isDemo: boolean;
  email: string;
  now: number | null;
  status: Status;
  events: DeviceEvent[];
  reloadEvents: () => Promise<void>;
  virtual: {
    mode: VirtualMode;
    setEnabled: (on: boolean) => void;
    pour: (kind: Fault) => void;
    unplug: () => void;
    pouring: Fault | null;
    unplugLeft: number | null;
  };
};

const LiveContext = createContext<Live | null>(null);

export function useLive() {
  const v = useContext(LiveContext);
  if (!v) throw new Error("useLive outside LiveProvider");
  return v;
}

const UNPLUG_MS = 45_000;
const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

export function LiveProvider({
  initialDevices,
  initialId,
  isDemo,
  email,
  children,
}: {
  initialDevices: Device[];
  initialId: string | null;
  isDemo: boolean;
  email: string;
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [devices, setDevices] = useState(initialDevices);
  const [id, setId] = useState(
    initialDevices.find((d) => d.id === initialId)?.id ?? initialDevices[0]?.id ?? null,
  );
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const device = devices.find((d) => d.id === id) ?? null;
  const deviceRef = useRef(device);
  deviceRef.current = device;

  const mergeDevice = useCallback((row: Partial<Device> & { id: string }) => {
    setDevices((list) => list.map((d) => (d.id === row.id ? { ...d, ...row } : d)));
  }, []);

  const reloadDevices = useCallback(async () => {
    const { data } = await supabase.from("devices").select(DEVICE_COLUMNS).order("created_at");
    if (data) setDevices(data as unknown as Device[]);
  }, [supabase]);

  const reloadEvents = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("device_id", id)
      .order("at", { ascending: false })
      .limit(40);
    if (data) setEvents(data as DeviceEvent[]);
  }, [supabase, id]);

  const select = useCallback((next: string) => {
    setId(next);
    setEvents([]);
    document.cookie = `wqm_device=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  // clock
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // realtime, with polling behind it in case the socket drops
  useEffect(() => {
    if (!id) return;
    reloadEvents();
    const ch = supabase
      .channel(`tank-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "devices", filter: `id=eq.${id}` }, (p) =>
        mergeDevice(p.new as Device),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `device_id=eq.${id}` }, (p) => {
        const e = p.new as DeviceEvent;
        if (!e?.id) return;
        setEvents((list) => [e, ...list.filter((x) => x.id !== e.id)].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40));
        if (p.eventType === "INSERT" && e.kind === "stopped") notify(e);
      })
      .subscribe();
    const poll = setInterval(async () => {
      const { data } = await supabase.from("devices").select(DEVICE_COLUMNS).eq("id", id).maybeSingle();
      if (data) mergeDevice(data as unknown as Device);
    }, 10_000);
    const pollEvents = setInterval(reloadEvents, 30_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
      clearInterval(pollEvents);
    };
  }, [id, supabase, mergeDevice, reloadEvents]);

  // ---- virtual board: it runs on the server, so every open tab and every demo visitor sees one board ----
  const [enabled, setEnabledState] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [unplugUntil, setUnplugUntil] = useState<number | null>(null);

  useEffect(() => {
    if (id) setEnabledState(store.get(`wqm-virtual-${id}`) !== "off");
  }, [id]);

  const setEnabled = useCallback(
    (on: boolean) => {
      if (id) store.set(`wqm-virtual-${id}`, on ? "on" : "off");
      setEnabledState(on);
    },
    [id],
  );

  const boardOnline =
    device?.last_source === "board" && !!device.last_seen_at && (now ?? 0) - Date.parse(device.last_seen_at) < 60_000;
  const unplugged = unplugUntil !== null && (now ?? 0) < unplugUntil;
  const mode: VirtualMode = boardOnline ? "board" : !enabled ? "off" : unplugged ? "unplugged" : "on";
  const running = mode === "on" && !hidden && !!id;
  const pouring =
    device?.sim_fault && device.sim_fault_until && (now ?? 0) < Date.parse(device.sim_fault_until) ? device.sim_fault : null;

  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === "hidden");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (unplugUntil === null) return;
    const t = setTimeout(() => setUnplugUntil(null), Math.max(0, unplugUntil - Date.now()));
    return () => clearTimeout(t);
  }, [unplugUntil]);

  const unpluggedRef = useRef(false);
  useEffect(() => {
    if (unplugUntil !== null) unpluggedRef.current = true;
  }, [unplugUntil]);

  useEffect(() => {
    if (!running || !id) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // ask the server for the next reading; when another tab or visitor just took one, realtime brings it
    const tick = async () => {
      const { data, error } = await supabase.rpc("tick_virtual", { p_device: id });
      if (stop) return;
      if (!error && data?.ok) {
        const { ok: _ok, ...row } = data as Partial<Device> & { ok: boolean };
        mergeDevice({ ...row, id });
      }
      timer = setTimeout(tick, SAMPLE_S * 1000);
    };

    (async () => {
      // fill the gap since the virtual board last ran, unless the person pulled the plug on purpose
      if (!unpluggedRef.current) {
        const { data: added } = await supabase.rpc("fill_virtual_history", { p_device: id });
        if (added) {
          await reloadEvents();
          const { data } = await supabase.from("devices").select(DEVICE_COLUMNS).eq("id", id).maybeSingle();
          if (data) mergeDevice(data as unknown as Device);
        }
      }
      unpluggedRef.current = false;
      if (!stop) tick();
    })();

    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [running, id, supabase, mergeDevice, reloadEvents]);

  const pour = useCallback(
    async (kind: Fault) => {
      if (!id) return;
      const { data: until, error } = await supabase.rpc("pour_virtual", { p_device: id, p_kind: kind });
      if (!error) mergeDevice({ id, sim_fault: kind, sim_fault_until: until as string });
    },
    [id, supabase, mergeDevice],
  );

  const unplug = useCallback(() => setUnplugUntil(Date.now() + UNPLUG_MS), []);

  const value: Live = {
    supabase,
    devices,
    device,
    select,
    reloadDevices,
    mergeDevice,
    isDemo,
    email,
    now,
    status: statusOf(device, now),
    events,
    reloadEvents,
    virtual: {
      mode,
      setEnabled,
      pour,
      unplug,
      pouring,
      unplugLeft: unplugged && now ? Math.ceil((unplugUntil! - now) / 1000) : null,
    },
  };
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

function notify(e: DeviceEvent) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    navigator.serviceWorker?.ready.then((r) =>
      r.showNotification("Pump stopped", { body: `${e.detail}.`, tag: `stop-${e.id}`, icon: "/icon-192.png" }),
    );
  } catch {}
}

export { OFFLINE_S };

import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RANGES, type Range } from "@/lib/data";

// CSV of a tank's readings for the report. The last hour is every reading; longer ranges are one row per
// minute, 10 minutes or hour, so a month stays a few hundred rows. Row level security limits it to the
// signed in owner's tanks.
const STEP: Record<Range, string | null> = { "1H": null, "24H": "1 minute", "7D": "10 minutes", "30D": "1 hour" };
const PAGE = 1000;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const device = q.get("device") ?? "";
  const range = (q.get("range") ?? "24H") as Range;
  if (!RANGES[range] || !/^[0-9a-f-]{36}$/.test(device)) return new Response("Unknown tank or range", { status: 400 });

  const supabase = await createClient();
  const { data: tank } = await supabase.from("devices").select("name").eq("id", device).maybeSingle();
  if (!tank) return new Response("Tank not found", { status: 404 });

  const from = new Date(Date.now() - RANGES[range].ms).toISOString();
  const lines: string[] = [];
  const step = STEP[range];
  for (let i = 0; ; i += PAGE) {
    if (step) {
      const { data, error } = await supabase
        .rpc("reading_series", { p_device: device, p_from: from, p_bucket: step })
        .range(i, i + PAGE - 1);
      if (error) return new Response(error.message, { status: 500 });
      const rows = (data ?? []) as { t: string; ph: number; ntu: number; n: number }[];
      rows.forEach((r) => lines.push([r.t, r.ph, r.ntu, r.n].join(",")));
      if (rows.length < PAGE) break;
    } else {
      const { data, error } = await supabase
        .from("readings")
        .select("at,ph,ntu,ph_v,ntu_v,pump_on,state,source")
        .eq("device_id", device)
        .gte("at", from)
        .order("at")
        .range(i, i + PAGE - 1);
      if (error) return new Response(error.message, { status: 500 });
      (data ?? []).forEach((r) =>
        lines.push([r.at, r.ph, r.ntu, r.ph_v ?? "", r.ntu_v ?? "", r.pump_on ? "on" : "off", r.state, r.source].join(",")),
      );
      if ((data ?? []).length < PAGE) break;
    }
  }

  const head = step
    ? `time,ph,turbidity_ntu,readings_in_${step.replace(" ", "_")}`
    : "time,ph,turbidity_ntu,ph_volts,turbidity_volts,pump,state,source";
  const name = `${String(tank.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${range.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response([head, ...lines].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

"use client";

// Settings: the safe range and timing the board stops the pump by, phone alerts, installing the app,
// and the account. Alerts are honest about their limit: without a push server they only reach an open app.
import { useEffect, useState } from "react";
import { signOut } from "@/app/login/actions";
import { useLive } from "./Live";
import { Dot, PageHead } from "./bits";
import { fmtLimit } from "@/lib/data";

type Limits = { ph_min: string; ph_max: string; ntu_max: string; confirm_s: string; restart_s: string };
type Msg = { text: string; err?: boolean } | null;
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function check(l: Limits) {
  const [a, b, t, c, r] = [l.ph_min, l.ph_max, l.ntu_max, l.confirm_s, l.restart_s].map(Number);
  if ([a, b, t, c, r].some((v) => !Number.isFinite(v))) return "Fill in every number.";
  if (a < 0 || b > 14) return "pH runs from 0 to 14.";
  if (a >= b) return "The lowest safe pH must be below the highest.";
  if (t <= 0 || t > 4000) return "Set the turbidity limit between 0 and 4000 NTU.";
  if (!Number.isInteger(c) || c < 1 || c > 60) return "Confirm for a whole number of seconds, 1 to 60.";
  if (!Number.isInteger(r) || r < 5 || r > 600) return "Wait to restart for a whole number of seconds, 5 to 600.";
  return null;
}

export function Settings() {
  const { supabase, device, isDemo, email, mergeDevice, reloadEvents } = useLive();
  const [form, setForm] = useState<Limits | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported" | null>(null);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);

  const fromDevice = () =>
    device && {
      ph_min: fmtLimit(device.ph_min),
      ph_max: fmtLimit(device.ph_max),
      ntu_max: fmtLimit(device.ntu_max),
      confirm_s: String(device.confirm_s),
      restart_s: String(device.restart_s),
    };

  useEffect(() => {
    setForm(fromDevice());
    setMsg(null);
  }, [device?.id, device?.ph_min, device?.ph_max, device?.ntu_max, device?.confirm_s, device?.restart_s]);

  useEffect(() => {
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!device || !form) return;
    const problem = check(form);
    if (problem) return setMsg({ text: problem, err: true });
    setBusy(true);
    const next = {
      ph_min: Number(form.ph_min),
      ph_max: Number(form.ph_max),
      ntu_max: Number(form.ntu_max),
      confirm_s: Number(form.confirm_s),
      restart_s: Number(form.restart_s),
    };
    const { error } = await supabase.rpc("set_limits", {
      p_device: device.id,
      p_ph_min: next.ph_min,
      p_ph_max: next.ph_max,
      p_ntu_max: next.ntu_max,
      p_confirm_s: next.confirm_s,
      p_restart_s: next.restart_s,
    });
    setBusy(false);
    if (error) return setMsg({ text: "Could not save the limits. Try again.", err: true });
    mergeDevice({ id: device.id, ...next });
    reloadEvents();
    setMsg({ text: "Saved. The board uses the new limits from its next reading." });
  }

  async function askNotify() {
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") {
      const reg = await navigator.serviceWorker?.getRegistration();
      reg?.showNotification("Alerts are on", { body: "You will see this when the pump stops.", icon: "/icon-192.png" });
    }
  }

  const changed = !!form && !!device && JSON.stringify(form) !== JSON.stringify(fromDevice());
  const field = (k: keyof Limits, label: string, unit: string, hint?: string, step = "0.1") => (
    <label className="field">
      {label}
      <span className="unit">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={form?.[k] ?? ""}
          disabled={isDemo}
          onChange={(e) => setForm({ ...form!, [k]: e.target.value })}
        />
        {unit && <em>{unit}</em>}
      </span>
      {hint && <span className="hint">{hint}</span>}
    </label>
  );

  return (
    <>
      <PageHead title="Settings" sub="The rules the board follows, alerts on this phone, and your account." />
      <div className="pg-body">
        {device && form && (
          <section className="panel">
            <h2 className="h">Safe range</h2>
            <p className="panel-sub">The board stops the pump when a reading leaves this range for the confirm time.</p>
            <form onSubmit={save}>
              <div className="form-grid two">
                {field("ph_min", "Lowest safe pH", "", "Malaysian drinking water allows 6.5.")}
                {field("ph_max", "Highest safe pH", "", "The standard allows 9.0. The project uses 8.5 until the supervisor confirms.")}
                {field("ntu_max", "Turbidity limit", "NTU", "The drinking water standard is 5 NTU.")}
              </div>
              <h2 className="h" style={{ marginTop: 26 }}>
                Timing
              </h2>
              <div className="form-grid two">
                {field("confirm_s", "Confirm before stopping", "s", "Stops a splash or bubble from stopping the pump.", "1")}
                {field("restart_s", "Wait before restarting", "s", "How long it must stay back in range.", "1")}
              </div>
              {isDemo ? (
                <p className="note" style={{ marginTop: 18 }}>
                  <b>The demo tank keeps its limits</b> so every visitor sees the same rules. Create your own account to change them.
                </p>
              ) : (
                <div className="actions">
                  <button type="submit" className="btn" disabled={!changed || busy}>
                    {busy ? "Saving…" : "Save limits"}
                  </button>
                  {changed && (
                    <button type="button" className="btn ghost" disabled={busy} onClick={() => setForm(fromDevice())}>
                      Undo changes
                    </button>
                  )}
                </div>
              )}
            </form>
            {msg && (
              <p className={`msg${msg.err ? " err" : ""}`} role={msg.err ? "alert" : "status"}>
                <Dot tone={msg.err ? "unsafe" : "safe"} />
                {msg.text}
              </p>
            )}
          </section>
        )}

        <section className="panel">
          <h2 className="h">Alerts on this device</h2>
          <p className="panel-sub">
            {perm === "granted"
              ? "On. You get an alert when the pump stops while the app is open in the background."
              : perm === "denied"
                ? "Blocked in this browser’s settings. Allow notifications for this site there, then come back."
                : perm === "unsupported"
                  ? "This browser cannot show alerts. On an iPhone, add the app to the Home Screen first, then open it from there."
                  : "Get an alert when the pump stops while the app is open in the background."}
          </p>
          {perm === "default" && (
            <div className="actions">
              <button type="button" className="btn ghost" onClick={askNotify}>
                Turn on alerts
              </button>
            </div>
          )}
          <p className="note" style={{ marginTop: 14 }}>
            <b>Alerts need the app open.</b> Reaching a closed app needs a push server, which this project does not run yet. The
            pump still stops on its own either way.
          </p>
        </section>

        <section className="panel">
          <h2 className="h">Install the app</h2>
          {installed ? (
            <p className="panel-sub">Installed. Open it from your Home Screen.</p>
          ) : install ? (
            <>
              <p className="panel-sub">Adds it to your Home Screen so it opens full screen, like any other app.</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={async () => {
                    await install.prompt();
                    if ((await install.userChoice).outcome === "accepted") setInstalled(true);
                    setInstall(null);
                  }}
                >
                  Install
                </button>
              </div>
            </>
          ) : (
            <dl className="kv">
              <div>
                <dt>iPhone</dt>
                <dd>Safari, Share, Add to Home Screen</dd>
              </div>
              <div>
                <dt>Android</dt>
                <dd>Chrome menu, Install app</dd>
              </div>
            </dl>
          )}
        </section>

        <section className="panel">
          <h2 className="h">Account</h2>
          {isDemo ? (
            <>
              <p className="panel-sub">You are in the shared demo. Your own account gets its own tank, limits and history.</p>
              <div className="actions">
                <button type="button" className="btn" onClick={() => signOut("signup")}>
                  Create your own account
                </button>
              </div>
            </>
          ) : (
            <>
              <dl className="kv">
                <div>
                  <dt>Signed in as</dt>
                  <dd style={{ minWidth: 0, overflowWrap: "anywhere" }}>{email}</dd>
                </div>
              </dl>
              <div className="actions">
                <button type="button" className="btn ghost" onClick={() => signOut()}>
                  Sign out
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

"use client";

// Device: the tank's name and facts, the virtual board, and the three steps to connect the real UNO R4
// WiFi (make a key, download the filled in sketch, flash it). Also where a second tank is added.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLive } from "./Live";
import { Icon } from "./icons";
import {
  Dot,
  PageHead,
  STATUS_WORDS,
  VirtualControls,
  sourceWord,
} from "./bits";
import {
  ago,
  DEVICE_COLUMNS,
  fmtLimit,
  when,
  type Device as Tank,
} from "@/lib/data";
import { sketch, sketchFileName } from "@/lib/sketch";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

type Msg = { text: string; err?: boolean } | null;

export function Device() {
  const {
    supabase,
    device,
    devices,
    now,
    status,
    isDemo,
    mergeDevice,
    reloadDevices,
    select,
  } = useLive();
  const [name, setName] = useState(device?.name ?? "");
  const [key, setKey] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, Msg>>({});
  const say = (k: string, m: Msg) => setMsg((all) => ({ ...all, [k]: m }));

  useEffect(() => {
    setName(device?.name ?? "");
    setKey(null);
    setMsg({});
  }, [device?.id, device?.name]);

  async function addTank(e: React.FormEvent) {
    e.preventDefault();
    const n = newName.trim() || `Tank ${devices.length + 1}`;
    setBusy("add");
    const { data, error } = await supabase
      .from("devices")
      .insert({ name: n })
      .select(DEVICE_COLUMNS)
      .single();
    setBusy(null);
    if (error || !data)
      return say("add", {
        text: "Could not add the tank. Try again.",
        err: true,
      });
    await reloadDevices();
    select((data as unknown as Tank).id);
    setNewName("");
    say("add", { text: `Added “${n}”. You are now looking at it.` });
  }

  if (!device)
    return (
      <>
        <PageHead title="Device" sub="Add your first tank to start." />
        <div className="pg-body">
          <section className="panel">
            <AddTank
              name={newName}
              setName={setNewName}
              busy={busy === "add"}
              onSubmit={addTank}
              msg={msg.add}
              disabled={isDemo}
            />
          </section>
        </div>
      </>
    );

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || n === device!.name) return;
    setBusy("name");
    const { error } = await supabase
      .from("devices")
      .update({ name: n })
      .eq("id", device!.id);
    setBusy(null);
    if (error)
      return say("name", {
        text: "Could not rename the tank. Try again.",
        err: true,
      });
    mergeDevice({ id: device!.id, name: n });
    say("name", { text: "Renamed." });
  }

  async function makeKey() {
    if (
      device!.key_hint &&
      !confirm(
        "Make a new key? The board using the old key stops sending until you flash it again.",
      )
    )
      return;
    setBusy("key");
    const { data, error } = await supabase.rpc("new_device_key", {
      p_device: device!.id,
    });
    setBusy(null);
    if (error || !data)
      return say("key", {
        text: "Could not make a key. Try again.",
        err: true,
      });
    setKey(data as string);
    mergeDevice({ id: device!.id, key_hint: (data as string).slice(-4) });
    say("key", null);
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(key!);
      say("key", { text: "Copied. It is also inside the sketch below." });
    } catch {
      say("key", {
        text: "Copying is blocked here. Select the key and copy it by hand.",
        err: true,
      });
    }
  }

  function download() {
    const text = sketch({
      key: key ?? "YOUR_DEVICE_KEY",
      supabaseUrl: SUPABASE_URL,
      publishableKey: PUBLISHABLE_KEY,
      device: device!,
    });
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: sketchFileName(device!),
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  const s = STATUS_WORDS[status];
  const facts: [string, React.ReactNode][] = [
    [
      "Status",
      <>
        <Dot tone={s.tone} />
        {s.word}
      </>,
    ],
    ["Readings from", sourceWord(device)],
    [
      "Last reading",
      device.last_seen_at && now ? ago(device.last_seen_at, now) : "None yet",
    ],
    [
      "Pump",
      device.pump_on === null
        ? "Unknown"
        : device.pump_on
          ? "Running"
          : "Stopped",
    ],
    ["Safe pH", `${fmtLimit(device.ph_min)} to ${fmtLimit(device.ph_max)}`],
    ["Turbidity limit", `${fmtLimit(device.ntu_max)} NTU`],
    [
      "Calibrated",
      device.calibrated_at && now ? when(device.calibrated_at, now) : "Not yet",
    ],
    ["Device key", device.key_hint ? `Ends in ${device.key_hint}` : "None yet"],
  ];

  return (
    <>
      <PageHead
        title="Device"
        sub="The tank, its board, and how to connect the real one."
      />
      <div className="pg-body">
        <div className="cols">
          <section className="panel">
            <h2 className="h">This tank</h2>
            <form className="form-grid" onSubmit={rename}>
              <label className="field">
                Name
                <input
                  value={name}
                  maxLength={40}
                  disabled={isDemo}
                  onChange={(e) => setName(e.target.value)}
                />
                {isDemo && (
                  <span className="hint">
                    The shared demo tank keeps its name.
                  </span>
                )}
              </label>
              {!isDemo && name.trim() && name.trim() !== device.name && (
                <div>
                  <button
                    type="submit"
                    className="btn"
                    disabled={busy === "name"}
                  >
                    {busy === "name" ? "Saving…" : "Save name"}
                  </button>
                </div>
              )}
            </form>
            <Message m={msg.name} />
            <dl className="kv">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <nav className="navrows only-phone" aria-label="More for this tank">
              <Link href="/app/calibration">
                <Icon name="calibration" />
                <span>
                  Calibration
                  <small>Teach it your buffers and clear water</small>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
              <Link href="/app/settings">
                <Icon name="settings" />
                <span>
                  Settings
                  <small>Safe range, timing, alerts and account</small>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
            </nav>
          </section>

          <section className="panel">
            <VirtualControls />
          </section>
        </div>

        <section className="panel">
          <h2 className="h">Connect the real board</h2>
          <p className="panel-sub">
            For the UNO R4 WiFi with the project’s wiring. The pump decision
            stays on the board, so it keeps protecting the tank when the Wi‑Fi
            drops.
          </p>
          <ol className="steps">
            <li>
              <b>Make a device key</b>
              <span>
                It lets the board send readings for this tank only. It is shown
                once, so download the sketch right after.
              </span>
              {key ? (
                <>
                  <div className="keybox">{key}</div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={copyKey}
                    >
                      <Icon name="copy" size={16} />
                      Copy key
                    </button>
                  </div>
                </>
              ) : (
                <div className="actions">
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={isDemo || busy === "key"}
                    onClick={makeKey}
                  >
                    {busy === "key"
                      ? "Making…"
                      : device.key_hint
                        ? "Make a new key"
                        : "Make a key"}
                  </button>
                </div>
              )}
              {isDemo && (
                <span className="hint">
                  Create your own account to connect a board. The demo tank
                  cannot take one.
                </span>
              )}
              <Message m={msg.key} />
            </li>
            <li>
              <b>Download the sketch</b>
              <span>
                {key
                  ? "Your key, the app’s address and this tank’s limits are filled in. Add your Wi‑Fi name and password at the top."
                  : "Make a key first, or the sketch has YOUR_DEVICE_KEY where the key goes."}
              </span>
              <div className="actions">
                <button
                  type="button"
                  className={`btn sm${key ? "" : " ghost"}`}
                  onClick={download}
                >
                  <Icon name="download" size={16} />
                  {sketchFileName(device)}
                </button>
              </div>
            </li>
            <li>
              <b>Flash it and wait for the first reading</b>
              <span>
                Open it in the Arduino IDE, pick UNO R4 WiFi, upload. Once it
                joins the Wi‑Fi, “Readings from” above changes to Real board and
                the virtual board pauses.
              </span>
            </li>
          </ol>
          <p className="note">
            <b>Not yet tested on the real hardware.</b> Try it on the bench with
            the pump unplugged first. The board sends to{" "}
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                wordBreak: "break-all",
              }}
            >
              {SUPABASE_URL}/rest/v1/rpc/ingest
            </span>
          </p>
        </section>

        <section className="panel">
          <AddTank
            name={newName}
            setName={setNewName}
            busy={busy === "add"}
            onSubmit={addTank}
            msg={msg.add}
            disabled={isDemo}
          />
        </section>
      </div>
    </>
  );
}

function AddTank({
  name,
  setName,
  busy,
  onSubmit,
  msg,
  disabled,
}: {
  name: string;
  setName: (v: string) => void;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
  msg: Msg;
  disabled: boolean;
}) {
  return (
    <>
      <h2 className="h">Add a tank</h2>
      <p className="panel-sub">
        Each tank has its own board, limits and history. Switch between them
        from the name at the top.
      </p>
      <form className="form-grid two" onSubmit={onSubmit}>
        <label className="field">
          Name
          <input
            value={name}
            maxLength={40}
            disabled={disabled}
            placeholder="Rooftop tank"
            onChange={(e) => setName(e.target.value)}
          />
          {disabled && (
            <span className="hint">
              The demo has one shared tank. Create your own account to add more.
            </span>
          )}
        </label>
        <div style={{ alignSelf: "end" }}>
          <button
            type="submit"
            className="btn ghost"
            disabled={disabled || busy}
          >
            <Icon name="plus" size={16} />
            {busy ? "Adding…" : "Add tank"}
          </button>
        </div>
      </form>
      <Message m={msg} />
    </>
  );
}

function Message({ m }: { m: Msg | undefined }) {
  if (!m) return null;
  return (
    <p
      className={`msg${m.err ? " err" : ""}`}
      role={m.err ? "alert" : "status"}
    >
      <Dot tone={m.err ? "unsafe" : "safe"} />
      {m.text}
    </p>
  );
}

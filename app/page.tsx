import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { LiveChip } from "@/components/LiveChip";
import { ButtonLink, Logo } from "@/components/ui";
import { LIMITS, REPO_URL, phRange } from "@/lib/monitor";
import front from "@/public/img/assembly_front_cut.png";
import exploded from "@/public/img/exploded_iso_cut.png";

const steps = [
  { title: "Sense", text: "A pH probe and a turbidity sensor read the water every 2 seconds." },
  { title: "Decide", text: "The board compares each reading with the limits. It needs no internet to do this." },
  { title: "Act", text: "If a reading stays out of range for 2 seconds, the relay cuts the pump and the phone is told." },
];

const timeline = [
  { at: "0 s", title: "pH reads 8.92", text: `Above the ${LIMITS.ph.max} limit.`, tone: "bad" },
  { at: "2 s", title: "Still above", text: "Confirmed, so one bad sample is ignored.", tone: "bad" },
  { at: "2 s", title: "Relay off", text: "The pump stops. The LCD shows PUMP OFF, pH HIGH.", tone: "bad" },
  { at: "3 s", title: "Phone alerted", text: "The cloud records the stop and sends the alert.", tone: "ink" },
  { at: "Later", title: "Back in range", text: "The reading returns inside the limits.", tone: "ok" },
  { at: "+30 s", title: "Pump restarts", text: "Only after 30 seconds in range.", tone: "ok" },
] as const;

const parts = [
  { name: "pH probe", text: "Reads acidity from 0 to 14. Connected to analog pin A0." },
  { name: "Turbidity sensor", text: "Reads cloudiness in NTU. Connected to analog pin A1." },
  { name: "Arduino UNO R4 WiFi", text: "Compares every reading with the limits and sends it to the cloud." },
  { name: "Relay on pin D2", text: "Switches the 12 V pump off the moment the board decides." },
  { name: "12 V pump", text: "Moves the water. It only runs while both readings are safe." },
  { name: "LCD 16×2", text: "Shows the readings and the pump state on the box itself." },
  { name: "Acrylic enclosure", text: "166 × 116 × 216 mm, holding the electronics above the sample tank." },
];

const specs = [
  ["Readings", "pH 0 to 14, turbidity in NTU"],
  ["Sample rate", "Every 2 seconds"],
  ["Safe range", `pH ${phRange}, turbidity at most ${LIMITS.ntu.max} NTU`],
  ["Action", "Relay cuts the 12 V pump"],
  ["Response", "Pump off within 2 s of a confirmed reading"],
  ["Restart", "After 30 s back in range"],
  ["Board", "Arduino UNO R4 WiFi"],
  ["Display", "LCD 16×2 over I2C"],
  ["Enclosure", "Acrylic, 166 × 116 × 216 mm"],
  ["Records", "Every reading and stop, stored in the cloud"],
];

const runs = [
  { sample: "Tap water", why: "Inside both limits. The control.", expect: "Pump keeps running" },
  { sample: "pH 9.18 buffer solution", why: `Above the pH ${LIMITS.ph.max} limit.`, expect: "Pump stops" },
  { sample: "Muddy water", why: `Above the ${LIMITS.ntu.max} NTU limit.`, expect: "Pump stops" },
];

const dotTone = { bad: "bg-unsafe", ink: "bg-ink", ok: "bg-safe" };

export default function Home() {
  return (
    <div className="bg-card">
      <header className="sticky top-0 z-20 border-b border-line-2 bg-card">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8" aria-label="Main">
          <Link href="/" className="flex min-h-11 items-center gap-2 whitespace-nowrap text-[15px] font-semibold">
            <Logo />
            Water Quality Monitor
          </Link>
          <div className="flex items-center gap-1">
            {[
              ["How it works", "#how"],
              ["Inside", "#inside"],
              ["Specifications", "#specs"],
              ["Results", "#results"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="hidden min-h-11 items-center rounded-lg px-3 text-sm text-ink-2 transition-colors duration-150 hover:text-ink md:inline-flex"
              >
                {label}
              </a>
            ))}
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-2 text-sm text-ink-2 transition-colors duration-150 hover:text-ink sm:px-3"
            >
              Sign in
            </Link>
            <Link
              href="/demo"
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm font-semibold text-brand transition-colors duration-150 hover:text-brand-deep sm:ml-2 sm:px-3"
            >
              <span className="hidden sm:inline">Live demo</span>
              <span className="sm:hidden">Demo</span>
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero: the real object on a plain stage, one line, one live reading */}
        <section className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-10 px-5 pt-12 pb-16 sm:px-8 md:grid-cols-[1.05fr_1fr] md:pt-20 md:pb-24">
          <div>
            <p className="text-sm text-ink-2">Final year project · MEC299 · UiTM Pasir Gudang</p>
            <h1 className="mt-4 text-[2.5rem] leading-[1.06] font-semibold tracking-[-0.03em] sm:text-5xl lg:text-[3.5rem]">
              Knows when water is unsafe. Stops the pump before it spreads.
            </h1>
            <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-ink-2">
              A small monitor that reads pH and turbidity every two seconds and cuts the pump on its own the moment a
              reading leaves the safe range.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/demo" prefetch={false}>
                Open the live demo
              </ButtonLink>
              <ButtonLink href="#how" variant="secondary">
                How it works
              </ButtonLink>
            </div>
          </div>
          <div className="relative flex aspect-[5/4] items-center justify-center rounded-2xl bg-ground">
            <Image
              src={front}
              alt="The monitor: a clear acrylic box with the LCD on the front and the sensors below"
              priority
              sizes="(min-width: 768px) 40vw, 80vw"
              className="h-[86%] w-auto max-w-full min-w-0 object-contain"
            />
            <div className="absolute right-4 bottom-4 sm:right-5 sm:bottom-5">
              <LiveChip />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-line-2 bg-ground">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.4fr] md:gap-16">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">How it works</h2>
              <p className="max-w-[40rem] text-lg leading-relaxed text-ink-2">
                The board decides and cuts the pump. The cloud only watches, records and alerts, so a Wi‑Fi drop never
                leaves the water unprotected.
              </p>
            </div>

            <ol className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-10">
              {steps.map((s, i) => (
                <li key={s.title} className="border-t-2 border-ink pt-4">
                  <div className="flex items-baseline gap-3">
                    <span className="text-sm text-faint">{i + 1}</span>
                    <h3 className="text-xl font-semibold">{s.title}</h3>
                  </div>
                  <p className="mt-2 leading-relaxed text-ink-2">{s.text}</p>
                </li>
              ))}
            </ol>

            <div className="mt-16 rounded-2xl bg-card p-6 sm:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">When pH goes too high</h3>
                <p className="text-sm text-faint">Designed behaviour, seconds after the first high reading</p>
              </div>
              <ol className="relative mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4">
                <div aria-hidden="true" className="absolute top-[1.65rem] right-0 left-0 hidden h-px bg-line lg:block" />
                {timeline.map((t, i) => (
                  <li key={i} className="relative">
                    <div className="font-mono text-xs text-ink-2">{t.at}</div>
                    <div className={`mt-2 size-2.5 rounded-full ring-4 ring-card ${dotTone[t.tone]}`} />
                    <div className="mt-3 font-semibold">{t.title}</div>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">{t.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Inside the box */}
        <section id="inside" className="border-t border-line-2">
          <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 md:grid-cols-2 md:py-24">
            <div className="flex items-center justify-center rounded-2xl bg-ground p-8 md:order-2">
              <Image
                src={exploded}
                alt="Exploded view of the monitor showing the enclosure panels, board, relay, LCD and sensors"
                sizes="(min-width: 768px) 45vw, 90vw"
                className="h-auto max-h-[34rem] w-auto max-w-full min-w-0 object-contain"
              />
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">Inside the box</h2>
              <p className="mt-4 max-w-[32rem] text-lg leading-relaxed text-ink-2">
                Off-the-shelf sensors and a standard Arduino board, in an acrylic enclosure designed for this
                project.
              </p>
              <dl className="mt-8 divide-y divide-line-2 border-y border-line-2">
                {parts.map((p) => (
                  <div key={p.name} className="grid grid-cols-1 gap-1 py-3.5 sm:grid-cols-[11rem_1fr] sm:gap-6">
                    <dt className="font-semibold">{p.name}</dt>
                    <dd className="text-ink-2">{p.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* Specifications */}
        <section id="specs" className="border-t border-line-2 bg-ground">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24">
            <h2 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">Specifications</h2>
            <dl className="mt-10 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
              {specs.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[9rem_1fr] gap-4 border-t border-line py-4">
                  <dt className="text-ink-2">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 max-w-[44rem] text-sm leading-relaxed text-faint">
              The upper pH limit of {LIMITS.ph.max} follows the common operating range for treated water. The Malaysian
              drinking water standard allows up to 9.0.
            </p>
          </div>
        </section>

        {/* Results: the method, honestly marked as in progress */}
        <section id="results" className="border-t border-line-2">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">Results</h2>
              <span className="inline-flex items-center gap-2 rounded-full bg-check-bg px-3 py-1 text-sm font-medium text-check">
                <span className="size-2 rounded-full bg-check" aria-hidden="true" />
                Testing in progress
              </span>
            </div>
            <p className="mt-4 max-w-[40rem] text-lg leading-relaxed text-ink-2">
              Three water samples, each run three times. Every run checks that the pump does the right thing and how
              fast it reacts. Measured results appear here once the runs are done.
            </p>

            <div className="mt-10 overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[40rem] border-collapse text-left">
                <thead>
                  <tr className="bg-ground text-sm text-ink-2">
                    <th scope="col" className="px-5 py-3 font-medium">Sample</th>
                    <th scope="col" className="px-5 py-3 font-medium">Why this sample</th>
                    <th scope="col" className="px-5 py-3 font-medium">Expected</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Runs</th>
                    <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.sample} className="border-t border-line-2">
                      <td className="px-5 py-4 font-semibold">{r.sample}</td>
                      <td className="px-5 py-4 text-ink-2">{r.why}</td>
                      <td className="px-5 py-4">{r.expect}</td>
                      <td className="px-5 py-4 text-right">3</td>
                      <td className="px-5 py-4 text-ink-2">Not run yet</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
              {[
                ["Correct pump decisions", "out of 9 runs"],
                ["Response time", "from a confirmed reading to relay off"],
                ["pH accuracy", "against a lab meter, mean error"],
              ].map(([k, v]) => (
                <div key={k} className="border-t border-line pt-4">
                  <div className="font-semibold">{k}</div>
                  <div className="mt-1 text-sm text-ink-2">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to the demo */}
        <section className="border-t border-line-2 bg-ink text-white">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-14 sm:px-8 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">Try the safety logic yourself.</h2>
              <p className="mt-2 text-[#c9d3db]">Push the pH too high in the demo and watch the pump stop, then restart.</p>
            </div>
            <Link
              href="/demo"
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-white px-4 text-[15px] font-semibold text-ink transition-[background-color,transform] duration-150 ease-out hover:bg-brand-tint active:scale-[0.96]"
            >
              Open the live demo
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-sm text-ink-2 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Logo />
            <span>
              Water Quality Monitor · MEC299 final year project, UiTM Pasir Gudang. Readings on this site are simulated
              until the monitor is online.
            </span>
          </div>
          <a
            href={REPO_URL}
            className="inline-flex min-h-11 items-center gap-1 font-medium text-ink hover:underline"
            rel="noreferrer"
          >
            Source code
            <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden="true" />
          </a>
        </div>
      </footer>
    </div>
  );
}

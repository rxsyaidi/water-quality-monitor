# Water Quality Monitor

A small monitor that reads **pH** and **turbidity** every two seconds and stops the pump on its own when the water leaves the safe range.

This repository holds the project website and a live demo of the monitoring portal for a MEC299 final year project, *Design and Fabrication of a Prototype for Real-time Water Quality Monitoring System*, at UiTM Pasir Gudang.

> **Readings on this site are simulated.** The demo runs the same safety logic as the device, on generated data, so anyone can try it in a browser. No test results are claimed until the bench tests are run.

## What the device does

| Step | What happens |
|---|---|
| Sense | pH probe (A0) and turbidity sensor (A1) are read every 2 s on an Arduino UNO R4 WiFi |
| Decide | A reading outside the limits must stay out for 2 s before the monitor acts, so one noisy sample never stops the pump |
| Act | The relay (D2) cuts the 12 V pump, the LCD shows the reason, and an alert is sent |
| Recover | When readings are back in range for 30 s, the pump restarts |

The board makes every safety decision. The cloud only watches, records and alerts.

### Limits

| Measure | Safe range | Note |
|---|---|---|
| pH | 6.5 to 8.5 | Upper limit still to be confirmed (MOH drinking water allows up to 9.0) |
| Turbidity | 5 NTU or less | MOH drinking water standard |

The limits and timings live in one place: [`lib/monitor.ts`](lib/monitor.ts).

## Pages

- `/` the project website: how it works, what is inside the box, specifications and the test plan
- `/demo` the monitoring portal on simulated readings. Use **Push pH to 8.9** or **Add muddy water** to watch the pump stop, then restart.

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run check    # type check
```

## Stack

Next.js 15 (App Router), React 19, Tailwind CSS 4, TypeScript, IBM Plex Sans and Mono, lucide icons. Fully static, deployed on Vercel.

## Design

The look is documented in [DESIGN.md](DESIGN.md): neutral by default, colour only for state, status always shown as a dot plus a word.

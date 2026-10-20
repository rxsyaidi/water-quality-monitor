# DESIGN.md — Water blue

The visual system for the Water Quality Monitor website and portal. Derived from the shipped code in `app/globals.css` and `components/`.

## Principles

1. **Neutral by default, colour only for state.** Following ISA-101 (the standard for industrial control screens), the interface is grey and white so that colour means something when it appears. Green is the safe band, amber is "checking", red is reserved for the pump stop.
2. **Status is a dot plus a word.** Never colour alone. Every state has a plain sentence explaining why.
3. **The reading is the hero.** Big, light, tabular numbers, with a range bar that shows where the value sits against its limits.
4. **Honest data.** Simulated readings are labelled as simulated. Untested results say "Not run yet", never a made up number.

## Colour

| Token | Hex | Use |
|---|---|---|
| `ground` | `#EEF1F3` | Page background |
| `card` | `#FFFFFF` | Cards, tiles, tables |
| `ink` | `#0F1B26` | Primary text, range bar marker |
| `ink-2` | `#46535F` | Secondary text |
| `faint` | `#5D6974` | Labels, captions (passes AA on `ground`) |
| `line` / `line-2` | `#D9DEE2` / `#E8ECEF` | Borders / row dividers |
| `brand` / `brand-deep` | `#0A5CA8` / `#084B8A` | Links, primary button, logo / hover |
| `brand-tint` | `#E3EEF8` | Active navigation |
| `safe` / `safe-band` / `safe-bg` | `#1D7F45` / `#CFE7D8` / `#DCEFE3` | Safe dot / safe zone on bars and charts / safe status card |
| `check` / `check-bg` | `#A86400` / `#FBEDD3` | Checking or restarting |
| `unsafe` / `unsafe-bg` | `#C42B23` / `#F8DEDB` | Pump stopped, out of range marker |
| `track` / `off` | `#E3E7EA` / `#8B969F` | Bar track / offline |

No transparency anywhere, so every surface prints and exports to PDF cleanly.

## Type

- **IBM Plex Sans** 300 / 400 / 500 / 600. Light (300) only for live readings; semibold (600) for headings and buttons.
- **IBM Plex Mono** only for timestamps in the event log and device details.
- Tabular numbers everywhere (`font-variant-numeric: tabular-nums`) so readings do not jitter.
- Headings use `text-wrap: balance`; body text uses `pretty`.

## Components

| Component | File | Rules |
|---|---|---|
| Status dot | `components/ui.tsx` | 8 px dot, always followed by a word |
| Button | `components/ui.tsx` | 44 px minimum height, 10 px radius, presses to 96% scale |
| Range bar | `components/RangeBar.tsx` | pH linear 0 to 14, turbidity log 0.1 to 1000. Green safe band, limit ticks, ink marker that turns red only when out of range, slides 700 ms ease-out |
| Line chart | `components/LineChart.tsx` | Last 6 minutes. Safe band fill, dashed limit lines, red columns while the pump was stopped |
| Status card | `components/Portal.tsx` | One sentence title plus the reason. Order of priority: pump stopped, checking, back in range, safe |
| Live chip | `components/LiveChip.tsx` | Hero badge on the website, marked "simulated" |

## Layout

- Website: max width about 72 rem, sticky top navigation, sections separated by space and hairline rules rather than boxes.
- Portal on laptop: left sidebar with scroll-spy (Overview, Readings, Alarms, Test runs, Device).
- Portal on phone: top bar plus a bottom tab bar (Now, History, Alerts, Tests, Device).
- Tested at 390 px wide with no horizontal scroll.

## Motion

Only where it carries information: the range bar marker moving, button press feedback. Everything is disabled under `prefers-reduced-motion`.

## Icons

lucide-react at 16 to 18 px, stroke 1.75 to 2, always next to a text label.

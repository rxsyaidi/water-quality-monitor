# DESIGN.md — Water blue, Timeline hero

The visual system for the Water Quality Monitor website and the signed in app. The app follows comp C, "Timeline hero" (`comps/c.html`, approved 21 Okt 2026). Derived from the shipped code: `app/globals.css` and `app/page.tsx` for the website, `app/app/app.css` and `components/app/` for the app.

## Principles

1. **Neutral by default, colour only for state.** Following ISA-101 (the standard for industrial control screens), surfaces are water blue, white and grey, so colour means something when it appears. Green is safe, amber is checking or restarting, red is the pump stop, slate is offline.
2. **Status is a dot plus a word.** Never colour alone. Every state has a plain sentence saying why.
3. **The answer first, then the story.** The hero says what the tank is doing now; the timeline under it says what the board did and why, newest first.
4. **Honest data.** Simulated readings say "Simulated". Untested hardware says "Not yet tested on the real hardware". Alerts say they need the app open.
5. **Nothing is see-through.** No rgba, opacity, blur or soft shadows, so every screen prints and exports to PDF cleanly.

## Colour

App tokens live on `.wq` in `app/app/app.css`. The website uses the Tailwind theme in `app/globals.css` with the same brand and state hues.

| Token | Hex | Use |
|---|---|---|
| `water` / `water-deep` | `#0B4F8E` / `#08406F` | App hero and phone page ground, PWA theme / pressed states |
| `on-water` / `on-water-2` | `#FFFFFF` / `#B9D3EC` | Text on water blue / secondary text on water blue |
| `paper` / `ground-2` | `#FFFFFF` / `#F3F7FB` | Sheets and panels / desktop ground, notes |
| `ink` / `ink2` / `faint` | `#0D1A26` / `#41505E` / `#5A6876` | Text, secondary text, labels |
| `line` / `line-2` | `#DCE4EC` / `#E9EEF3` | Borders / row dividers |
| `brand` / `brand-deep` / `brand-tint` | `#0A5CA8` / `#084B8A` / `#E1ECF7` | Links and primary buttons / hover / active navigation |
| `safe` / `safe-band` | `#1D7F45` / `#CFE7D8` | Safe dot / safe range on bars |
| `check` / `check-bg` | `#A86400` / `#FBEDD3` | Checking, restarting |
| `unsafe` / `unsafe-bg` | `#C42B23` / `#F8DEDB` | Pump stopped, out of range marker |
| `alarm` / `alarm-check` / `alarm-off` | `#B3261E` / `#8A5200` / `#33414E` | Solid hero alarm block: stopped / restarting or checking / offline |
| `w-safe` / `w-check` / `w-unsafe` / `w-off` | `#5FD08C` / `#F5B94A` / `#FF7A70` / `#9FB3C6` | Dots on water blue, brighter so they hold contrast |

## Type

- **IBM Plex Sans** 300 to 600. Light only for big live readings; semibold for headings and buttons.
- **IBM Plex Mono** only for timeline times, the device key and the ingest address. A countdown keeps only the number in mono, never the unit.
- Tabular numbers everywhere so readings do not jitter.

## App frame

- **Phone (under 900 px):** the page sits on water blue; a white sheet rises over it; a fixed bottom tab bar (Now, History, Alerts, Tests, Device). Calibration and Settings are reached from Device.
- **Desktop (900 px and up):** a white sticky sidebar with all 7 pages and the demo footer, a light ground, and the water blue hero as one rounded card beside its chart.
- Page head on the other pages: tank name with its status dot, source (Simulated or Real board), title, one sentence of purpose. On desktop it is a water blue band card, the same shape as the overview hero, so every page opens on the brand colour; panels sit below it as white cards, two side by side where they are short.

## Virtual board

The demo board runs on the server, not in the browser: each open page asks the database for the next reading every 2 s, and the database applies the same stop and restart rules as the firmware. Two people watching the shared demo tank therefore see the same state, the same countdown and one timeline. Simulated history is stored one reading a minute for the last day and one every 10 minutes before that, and the History page says so.

## Components

| Component | File | Rules |
|---|---|---|
| Hero | `components/app/Overview.tsx` | Tank, source, updated time; a solid alarm block only when not safe; Pump, Board and Last reading with dots; pH or turbidity chart with 1H to 30D |
| Chart | `components/app/WaterChart.tsx` | Safe band fill, limit labels, red columns while the pump was off |
| Range rows | `components/app/Overview.tsx` | Big light number, unit, bar with the safe band and an ink marker, dot plus word |
| Timeline | `components/app/Overview.tsx`, `Alerts.tsx` | Mono time, dot, title, one line of why; Alerts groups by day with filter chips |
| Panel | `app/app/app.css` `.panel` | 16 px radius, 1 px line, 22 to 26 px padding on desktop. Key value lists and single fields cap at 600 px wide |
| Steps | `app/app/app.css` `.steps` | Numbered circles with a connector, for connecting the real board |
| Buttons | `app/app/app.css` `.btn` | 44 px minimum, solid or ghost, disabled is solid grey, not faded |
| Note | `app/app/app.css` `.note` | Ground-2 box with a bold lead, for honest limits |

## Website

Max width about 72 rem, sticky top nav (Sign in and Live demo stay on one line; "Demo" under 640 px), sections separated by space and hairline rules. The hero is the real enclosure with one live reading marked simulated.

## Motion

Only where it carries information: range bar marker, chart point, button press. Disabled under `prefers-reduced-motion`.

## Icons

Line icons at 1.75 stroke in `components/app/icons.tsx` for the app, lucide-react on the website; always next to a word. PWA icon: a white drop with a water line on `#0B4F8E`.

## Checked

375, 390 and 430 px phones and 1440 desktop: no horizontal scroll, no console errors, states driven end to end (stopped, restarting, offline, test run matched, calibration saved).

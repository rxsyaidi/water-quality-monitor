# References: Water Quality Monitor app (21 Okt 2026)

Research for the real app build (Supabase, login, separate pages, virtual board, PWA). Task given to Mobbin each time: "a water quality monitoring app for a tank owner showing live pH and turbidity readings, alerts and history". Earlier references from design pack v4 (Blue Connect, Airthings, Ondilo, Moen Flo, Hach, ISA-101) still hold; see `../docs/design-pack-v4/`.

Opened before drawing: `80 Library/UX-UI/DESIGN.md`, `90 Reference/Anti-slop design rules.md`, `80 Library/AI-Ops/taste-calibration.md`, this project's DESIGN.md and PRODUCT.md, brand notes for IBM (Plex, Carbon), Oura (health monitor), DJI (hardware app).

## Mobbin screens

### Live readings and status (iOS)
- Bevel, health monitor cards: metric, vertical range indicator, status word. https://mobbin.com/screens/5addacbb-f7a4-4548-aac5-25863dae8bd9
- Tide Guide, blue water ground with a range bar and marker. https://mobbin.com/screens/3f126a65-3ae1-46fc-90e2-331a302aeca8
- Superpower biomarkers, optimal / normal / out of range bar. https://mobbin.com/screens/ed6614f1-f1c5-4018-97b3-cbca7e18f13f
- The Outsiders, readiness hero with a one line status sentence. https://mobbin.com/screens/a2db1179-056d-4d98-9bfd-848339905051
- LARQ pitcher, device hero plus filter status cards in navy and water blue. https://mobbin.com/screens/4ba84229-f841-48bb-8894-785f2d953d2a
- Starlink debug, status list as dot plus word. https://mobbin.com/screens/147e7dc9-71ab-4e3b-b578-28a09ede3bff
- Gentler Streak, honest "No data" states. https://mobbin.com/screens/f1eb0470-11a0-499c-a78c-f8ba02c3d79b

### Alerts and event history (iOS)
- Starlink outages: timeline of events with time, cause and duration, filter by 0.1 s+ / 2 s+ / 5 s+. https://mobbin.com/screens/80b46a69-ecc7-4754-ba88-72c0ea76ab69
- Fidelity alerts: dot plus one plain sentence plus time, grouped by day. https://mobbin.com/screens/cc7aaa1a-13fe-4ea7-b647-c1732db7302a
- SmartThings history: "Activity from the last 7 days", last synced time. https://mobbin.com/screens/5e69fa29-ceb0-497f-997a-80a1eb66e8f4
- The Weather Channel notifications: Latest / Manage tabs. https://mobbin.com/screens/3ef8c6b8-dd6c-46a7-adee-6ccb6d360122

### History charts (iOS)
- Bevel strain score: "Normal range 10 to 67%" shaded band behind the line, 1M / 3M / 6M / 1Y. https://mobbin.com/screens/953c3a4c-960d-4fdd-98cc-3a0a7bac470b
- Garmin body battery: daily high and low columns, then a list of days with High / Low. https://mobbin.com/screens/948cbbba-e02a-4a34-9785-c0bc1ce5a265
- Apple Weather pressure: current value plus "Falling", a day strip, and a written daily summary. https://mobbin.com/screens/79fc9984-e93e-4899-a0fa-915579c9549c
- MacroFactor scale weight: 1W / 1M / 3M / 6M / 1Y / All under the chart, entries listed below. https://mobbin.com/screens/7332c4ed-5f2c-45af-ac89-03fe44216f6e
- WHOOP trend view: average plus a plain sentence explaining the period. https://mobbin.com/screens/ac9866dd-4010-4028-b0c3-bf92ebcbb40a
- Google Health hydration, D / W / M / 3M / Y tabs. https://mobbin.com/screens/22478e0e-ea09-44b8-8f6c-d3b239a8aafe

### Desktop monitoring consoles (web)
- Neon monitoring: left nav, page title, "Last hour / Last day" segmented control at top right, "All OK" dot in the top bar. https://mobbin.com/screens/c5ee5c89-e7ad-43fc-828a-46315320e455
- Supabase observability: metric tiles, then a service health grid with a dot per service. https://mobbin.com/screens/704ea722-33ea-44f5-ba70-03005b33a9f9
- PlanetScale insights: tabbed metric strip above one large chart, range dropdown. https://mobbin.com/screens/3999967a-6855-4324-982b-3a7862a1796a
- Databricks data quality: "Healthy as of 13 minutes ago" and "Completeness is unknown" (honest pending state). https://mobbin.com/screens/1048f08c-8bc0-4b4f-b7d5-659cd5a77f97
- Vanta computers: device table with a last check column. https://mobbin.com/screens/3a576fae-5de1-4241-97bd-420225181c90

Rejected: Railway (near black console, wrong for a home owner), Replit and WRITER (developer analytics noise), Postman (illustrated empty state).

## Findings

1. **Plain status first, numbers second.** The Outsiders, LARQ and Databricks lead with one sentence ("Healthy as of 13 minutes ago"). The tank owner opens the app after an alert, so the first line must say what happened and what the board did.
2. **A reading needs its range beside it.** Bevel, Superpower and Tide Guide never show a bare number; there is always a band with a marker. Every pH and turbidity reading gets the range bar, and history charts shade the safe band (Bevel's "Normal range").
3. **Trusted event lists are timelines with a duration.** Starlink's outages list (time, cause, how long) is the model for pump stops: when, why, how long the pump was off, when it restarted.
4. **History uses a short segmented range control** (Neon, MacroFactor, Google Health): 1H / 24H / 7D / 30D, with a written summary under the chart (Apple Weather, WHOOP).
5. **Desktop = console shell.** Neon, Supabase and PlanetScale all use a left nav, page title, range control top right and a device status dot in the top bar. The phone keeps the bottom tab bar.

## Comps

Three directions for the Overview screen, phone (390) and laptop (1280): `comps/`.
- A, Status surface: the top of the screen is a solid block whose colour is the state (water blue = safe, amber = checking, red = pump stopped). Primary: LARQ + Tide Guide. Borrow: Starlink timeline, Neon shell.
- B, Instrument tiles: pale water ground, one tile per sensor with a vertical gauge and status word. Primary: Bevel. Borrow: Superpower band, Supabase health grid.
- C, Timeline hero: the last 24 h chart is the hero on a full water blue ground, with the status sentence above it. Primary: Apple Weather pressure + Tide Guide. Borrow: WHOOP summary sentence.

Critic (21 Okt 2026): C PASS 7.7, A FAIL 7.2, B FAIL 6.3. C revised: Safe gets its own dot, Pump/Board/Last reading row, green safe band, 30D, and `?state=stopped|offline` renders with a solid state block only for abnormal states (ISA-101).

Comps approved: C "Timeline hero", 21 Okt 2026 03:43 ("Sure go with C"). Build the app on comp C, with its stopped and offline states.

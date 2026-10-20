# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Installable on the phone as a web app (PWA); still one web design language, not native iOS or Android.

## Stack

Existing codebase: Next.js 15 (App Router), React 19, Tailwind CSS 4, TypeScript, deployed on Vercel. Decided 21 Oct 2026: the functional build adds a real database and login (Supabase, free tier) and a virtual board that sends readings until the real board is connected. Supabase account not created yet.

## Users

Primary: the owner of a water tank (a home or a school) who wants to know the water is safe without testing it by hand. They check the phone when an alert arrives or now and then, want a plain answer ("safe" or "pump stopped, here is why"), and occasionally look at history, change alert settings, or check the device.

Secondary: the supervisor and examiners of the MEC299 final year project at UiTM Pasir Gudang, who judge whether the system works and whether its claims are backed by evidence.

## Product Purpose

A small monitor inside the water line reads pH and turbidity every 2 s and stops the pump on its own when the water leaves the safe range, before unsafe water spreads through the system. The web app shows the owner what the monitor sees and did, alerts them, keeps the history, and lets them manage the device.

Success: the owner trusts the status at a glance, understands every pump stop from the app alone, and never has to test the water by hand to know it is safe.

## Positioning

The board acts, the app reports. The safety decision (confirm out of range for 2 s, cut the pump, restart after 30 s back in range) runs on the device and works with no internet; the cloud only watches, records and alerts. Most hobby monitors only display readings; this one stops the pump.

## Operating Context

- Hardware: Arduino UNO R4 WiFi; pH probe on A0, turbidity sensor on A1, relay on D2 driving a 12 V pump, 16×2 LCD over I2C, in an acrylic box 166 × 116 × 216 mm.
- Limits: pH 6.5 to 8.5 (upper limit awaiting supervisor confirmation; MOH drinking water allows 9.0); turbidity 5 NTU or less (MOH).
- Bench test plan: 3 samples (tap water, pH 9 solution, muddy water) × 3 runs, each run linked to its raw readings.
- Build order: Phase 0 USB dashboard, 1 Wi-Fi and cloud, 2 portal and app, 3 website.

## Capabilities and Constraints

- Today: project website and a demo portal on simulated readings (single page).
- Next (decided 21 Oct 2026): separate pages for overview, history, alarms, test runs, calibration, device and settings; login; data stored in a database; a virtual board sending readings; installable on the phone.
- The app never overrides the board's safety decision; any remote pump control is undecided.
- Terminology: "pump stopped", "checking", "back in range", "safe"; NTU for turbidity.

## Brand Commitments

- Name: "Water Quality Monitor" (kept by the owner's choice, 21 Oct 2026).
- No personal names (student or supervisor) on public surfaces until the student agrees.

## Evidence on Hand

- CAD renders: `public/img/` (front, isometric, exploded).
- Arduino sketch and suggested fixes: `../coding.completed.with.no.error.ino`, `../coding.suggested.fixes.ino`.
- No bench test results, calibration data, field data, users or testimonials exist yet. Never fabricate them; simulated data is always labelled simulated and untested results say "Not run yet".

## Product Principles

1. The board decides; the app explains. Every state the app shows comes with what the board did and why.
2. Plain answer first, detail on demand: status sentence, then readings, then history.
3. Honest data: real, simulated and pending are always distinguishable.
4. Works for a non-engineer tank owner and survives an examiner's scrutiny at the same time.

## Accessibility & Inclusion

Status never relies on colour alone (dot plus word). Readable at arm's length on a phone; works at 375 px wide with no horizontal scroll.

// Shared simulated data, icons, range bars and the 24 h chart for the three Overview comps.
// Every number here is simulated and labelled so on screen.
const SIM = { device: "Tank 1", ph: 7.21, ntu: 1.8, phMin: 6.5, phMax: 8.5, ntuMax: 5 };
// ?state=stopped (pH above the limit, pump off now) or ?state=offline (no reading for 30 min). Default safe.
const STATE = new URLSearchParams(location.search).get("state") || "safe";
document.documentElement.dataset.state = STATE;
if (STATE === "stopped") { SIM.ph = 9.02; SIM.ntu = 3.1; }

const ICONS = {
  now: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  history: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
  alerts: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  tests: '<path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"/><path d="M6.453 15h11.094"/><path d="M8.5 2h7"/>',
  calibration: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  device: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
  settings: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  drop: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
};
const icon = (n, s = 18) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

const NAV = [
  ["now", "Overview", "Now"], ["history", "History", "History"], ["alerts", "Alerts", "Alerts"],
  ["tests", "Test runs", "Tests"], ["calibration", "Calibration", null], ["device", "Device", "Device"],
  ["settings", "Settings", null],
];

function fillNav() {
  document.querySelectorAll("[data-sidenav]").forEach((el) => {
    el.innerHTML = NAV.map(([k, l], i) =>
      `<a class="sn${i === 0 ? " on" : ""}" href="#">${icon(k)}<span>${l}</span></a>`).join("");
  });
  document.querySelectorAll("[data-tabbar]").forEach((el) => {
    el.innerHTML = NAV.filter((n) => n[2]).map(([k, , t], i) =>
      `<a class="tb${i === 0 ? " on" : ""}" href="#">${icon(k, 22)}<span>${t}</span></a>`).join("");
  });
  document.querySelectorAll("[data-icon]").forEach((el) => (el.innerHTML = icon(el.dataset.icon, +el.dataset.size || 18)));
}

// Range bar positions: pH linear 0 to 14, turbidity log 0.1 to 1000 NTU (same as lib/monitor.ts).
const pos = (k, v) => (k === "ph" ? (v / 14) * 100 : ((Math.log10(Math.max(v, 0.1)) + 1) / 4) * 100);

function rangeBar(k, v, vertical) {
  const lo = k === "ph" ? pos("ph", SIM.phMin) : 0;
  const hi = k === "ph" ? pos("ph", SIM.phMax) : pos("ntu", SIM.ntuMax);
  const at = pos(k, v);
  const s = vertical ? "bottom" : "left", d = vertical ? "height" : "width";
  return `<div class="rb${vertical ? " v" : ""}"><div class="rb-band" style="${s}:${lo}%;${d}:${hi - lo}%"></div>` +
    `<div class="rb-mark" style="${s}:${at}%"></div></div>`;
}

function fillBars() {
  document.querySelectorAll("[data-bar]").forEach((el) => {
    const k = el.dataset.bar;
    el.innerHTML = rangeBar(k, k === "ph" ? SIM.ph : SIM.ntu, el.hasAttribute("data-vertical"));
  });
}

// 24 h of readings every 15 min ending now (10:42). One excursion yesterday 14:32 (pH 9.02),
// pump off 14:32 to 14:41, the event the comps tell the story around.
function rng(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function series() {
  const r = rng(11), out = [];
  for (let i = 0; i <= 96; i++) {
    let ph = 7.2 + Math.sin(i / 8) * 0.14 + (r() - 0.5) * 0.09;
    let ntu = 1.7 + Math.sin(i / 11 + 1) * 0.45 + r() * 0.35;
    if (STATE !== "stopped") {
      if (i === 15) { ph = 8.1; ntu = 2.4; }
      if (i === 16) { ph = 9.02; ntu = 3.1; }
      if (i === 17) { ph = 7.6; ntu = 2.6; }
    }
    out.push({ i, ph, ntu });
  }
  if (STATE === "stopped") { out[94].ph = 7.94; out[95].ph = 8.62; out[95].ntu = 2.8; }
  out[96].ph = SIM.ph; out[96].ntu = SIM.ntu;
  // offline: the last reading arrived at 10:12 (i = 94), nothing since
  return STATE === "offline" ? out.slice(0, 95) : out;
}

function chart(el) {
  const k = el.dataset.chart, W = el.clientWidth, H = +el.dataset.h || 180;
  const css = getComputedStyle(el), c = (n) => css.getPropertyValue(n).trim();
  const padL = 30, padR = 8, padT = 8, padB = 22, w = W - padL - padR, h = H - padT - padB;
  const [ymin, ymax] = k === "ph" ? [5.5, 9.5] : [0, 8];
  const X = (i) => padL + (i / 96) * w, Y = (v) => padT + h - ((v - ymin) / (ymax - ymin)) * h;
  const data = series();
  const bandTop = Y(k === "ph" ? SIM.phMax : SIM.ntuMax), bandBot = Y(k === "ph" ? SIM.phMin : 0);
  const pts = data.map((d) => `${X(d.i).toFixed(1)},${Y(Math.min(ymax, d[k])).toFixed(1)}`).join(" ");
  const [s0, s1] = STATE === "stopped" ? [95.9, 96] : [15.6, 16.2];
  const stopX = X(s0), stopW = Math.max(3, X(s1) - X(s0)), last = data[data.length - 1];
  const ticks = k === "ph" ? [6.5, 7.5, 8.5] : [0, 2.5, 5];
  // hours before now (10:42) for each label
  const labels = [["12:00", 22.7], ["18:00", 16.7], ["00:00", 10.7], ["06:00", 4.7], ["Now", 0]];
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${k} over the last 24 hours">
    <rect x="${padL}" y="${bandTop}" width="${w}" height="${bandBot - bandTop}" fill="${c("--c-band")}"/>
    <text x="${padL + w * 0.42}" y="${bandTop + 13}" font-size="10.5" fill="${c("--c-axis")}">Safe ${k === "ph" ? "6.5 to 8.5" : "up to 5 NTU"}</text>
    ${ticks.map((t) => `<line x1="${padL}" x2="${padL + w}" y1="${Y(t)}" y2="${Y(t)}" stroke="${c("--c-grid")}" stroke-width="1" ${t === (k === "ph" ? 7.5 : 2.5) ? "" : 'stroke-dasharray="3 3"'}/>
      <text x="${padL - 6}" y="${Y(t) + 4}" text-anchor="end" font-size="10.5" fill="${c("--c-axis")}">${t}</text>`).join("")}
    <rect x="${stopX}" y="${padT}" width="${stopW}" height="${h}" fill="${c("--c-stop")}"/>
    <polyline points="${pts}" fill="none" stroke="${c("--c-line")}" stroke-width="1.75" stroke-linejoin="round"/>
    ${STATE === "offline" ? `<rect x="${X(last.i)}" y="${padT}" width="${X(96) - X(last.i)}" height="${h}" fill="${c("--c-gap")}"/>
      <text x="${X(96)}" y="${padT + 13}" text-anchor="end" font-size="10.5" fill="${c("--c-axis")}">No data</text>` : ""}
    <circle cx="${X(last.i)}" cy="${Y(Math.min(ymax, last[k]))}" r="4" fill="${c("--c-line")}" stroke="${c("--c-dotring")}" stroke-width="2"/>
    ${labels.map(([t, hb]) => `<text x="${X(96 - hb * 4)}" y="${H - 6}" text-anchor="${hb === 0 ? "end" : "middle"}" font-size="10.5" fill="${c("--c-axis")}">${t}</text>`).join("")}
  </svg>`;
}

window.addEventListener("load", () => {
  // keep only the copy written for this state
  document.querySelectorAll("[data-s]").forEach((el) => el.dataset.s.split(" ").includes(STATE) || el.remove());
  fillNav(); fillBars();
  document.querySelectorAll("[data-chart]").forEach(chart);
});

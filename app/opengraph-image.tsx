import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Water Quality Monitor: knows when water is unsafe and stops the pump";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The link preview people see when the site is shared.
export default async function OpenGraphImage() {
  const render = await readFile(join(process.cwd(), "public/img/assembly_iso_cut.png"));
  const src = `data:image/png;base64,${render.toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#eef1f3", color: "#0f1b26" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 0 64px 72px", width: 700 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600 }}>
            <svg width="38" height="38" viewBox="0 0 18 18">
              <path d="M9 1.5C9 1.5 3.5 7.6 3.5 11.2A5.5 5.5 0 0 0 14.5 11.2C14.5 7.6 9 1.5 9 1.5Z" fill="#0a5ca8" />
              <rect x="5.6" y="10.6" width="6.8" height="1.4" fill="#fff" />
            </svg>
            Water Quality Monitor
          </div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 600, lineHeight: 1.08, letterSpacing: -2 }}>
            Knows when water is unsafe. Stops the pump before it spreads.
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#46535f" }}>
            pH and turbidity every 2 s · MEC299, UiTM Pasir Gudang
          </div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} height={520} alt="" />
        </div>
      </div>
    ),
    size,
  );
}

"use client";

// The frame around every signed in page: a sidebar on a desktop, a five tab bar on a phone.
// Calibration and Settings sit under Device on a phone, so the tab bar stays at five.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { useLive } from "./Live";
import { Icon, type IconName } from "./icons";

const NAV: { href: string; label: string; tab?: string; icon: IconName }[] = [
  { href: "/app", label: "Overview", tab: "Now", icon: "now" },
  { href: "/app/history", label: "History", tab: "History", icon: "history" },
  { href: "/app/alerts", label: "Alerts", tab: "Alerts", icon: "alerts" },
  { href: "/app/tests", label: "Test runs", tab: "Tests", icon: "tests" },
  { href: "/app/calibration", label: "Calibration", icon: "calibration" },
  { href: "/app/device", label: "Device", tab: "Device", icon: "device" },
  { href: "/app/settings", label: "Settings", icon: "settings" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { status, email, isDemo } = useLive();
  const current = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  // on a phone, Calibration and Settings light up the Device tab
  const tabCurrent = (href: string) =>
    current(href) || (href === "/app/device" && (current("/app/calibration") || current("/app/settings")));
  const alarm = status === "stopped";

  return (
    <div className="wq">
      <aside className="side">
        <Link href="/" className="brandmark">
          <i>
            <Icon name="drop" size={16} />
          </i>
          Water Quality Monitor
        </Link>
        <nav aria-label="App">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="sn" aria-current={current(n.href) ? "page" : undefined}>
              <Icon name={n.icon} size={19} />
              {n.label}
              {n.href === "/app/alerts" && alarm && <span className="badge" aria-label="Pump stopped" />}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          {isDemo ? (
            <>
              <b>Demo tank</b>
              Shared with other visitors.
              <br />
              <button type="button" onClick={() => signOut("signup")}>
                Create your own account
              </button>
            </>
          ) : (
            <>
              <b title={email}>{email}</b>
              <button type="button" onClick={() => signOut()}>
                Sign out
              </button>
            </>
          )}
        </div>
      </aside>
      <main className="main">{children}</main>
      <nav className="tabbar" aria-label="App">
        {NAV.filter((n) => n.tab).map((n) => (
          <Link key={n.href} href={n.href} className="tb" aria-current={tabCurrent(n.href) ? "page" : undefined}>
            <span>
              <Icon name={n.icon} />
              {n.href === "/app/alerts" && alarm && <i className="badge" aria-hidden="true" />}
            </span>
            {n.tab}
            {n.href === "/app/alerts" && alarm && <span className="sr-only">, pump stopped</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}

import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LiveProvider } from "@/components/app/Live";
import { Shell } from "@/components/app/Shell";
import { SwRegister } from "@/components/app/SwRegister";
import { DEVICE_COLUMNS, type Device } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import "./app.css";

export const metadata: Metadata = { title: { default: "Overview", template: "%s · Water Quality Monitor" } };
export const viewport: Viewport = { themeColor: "#0B4F8E", viewportFit: "cover" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const isDemo = user.app_metadata?.demo === true;

  const load = async () =>
    ((await supabase.from("devices").select(DEVICE_COLUMNS).order("created_at")).data ?? []) as unknown as Device[];
  let devices = await load();
  // a new account starts with one tank, run by the virtual board until a real one is connected
  if (devices.length === 0 && !isDemo) {
    await supabase.from("devices").insert({ name: "Tank 1" });
    devices = await load();
  }

  const store = await cookies();
  return (
    <LiveProvider
      initialDevices={devices}
      initialId={store.get("wqm_device")?.value ?? null}
      isDemo={isDemo}
      email={user.email ?? ""}
    >
      <Shell>{children}</Shell>
      <SwRegister />
    </LiveProvider>
  );
}

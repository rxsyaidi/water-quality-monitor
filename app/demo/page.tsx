import type { Metadata } from "next";
import { Portal } from "@/components/Portal";

export const metadata: Metadata = {
  title: "Live demo",
  description: "Try the monitor's safety logic on simulated readings: push the pH too high and watch the pump stop, then restart.",
};

export default function DemoPage() {
  return <Portal />;
}

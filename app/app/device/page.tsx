import type { Metadata } from "next";
import { Device } from "@/components/app/Device";

export const metadata: Metadata = { title: "Device" };

export default function DevicePage() {
  return <Device />;
}

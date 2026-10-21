import type { Metadata } from "next";
import { Calibration } from "@/components/app/Calibration";

export const metadata: Metadata = { title: "Calibration" };

export default function CalibrationPage() {
  return <Calibration />;
}

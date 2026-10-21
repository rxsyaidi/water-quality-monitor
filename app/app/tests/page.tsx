import type { Metadata } from "next";
import { Tests } from "@/components/app/Tests";

export const metadata: Metadata = { title: "Test runs" };

export default function TestsPage() {
  return <Tests />;
}

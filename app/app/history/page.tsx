import type { Metadata } from "next";
import { History } from "@/components/app/History";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return <History />;
}

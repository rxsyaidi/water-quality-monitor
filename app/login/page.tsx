import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };
export const viewport: Viewport = { themeColor: "#0B4F8E" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string; demo?: string }>;
}) {
  const { mode, next, demo } = await searchParams;
  return (
    <div className="min-h-dvh bg-[#0B4F8E] px-4 pt-[max(48px,env(safe-area-inset-top))] pb-10 sm:grid sm:place-items-center sm:py-16">
      <div className="mx-auto w-full max-w-[400px]">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 text-[15px] font-semibold text-white">
          <span className="grid size-7 place-items-center rounded-lg bg-white">
            <Logo />
          </span>
          Water Quality Monitor
        </Link>
        <p className="mt-6 text-[15px] leading-relaxed text-[#DCE9F6]">
          Live pH and turbidity for your tank, every stop the board makes, and the tests for the report.
        </p>
        <div className="mt-6 rounded-[18px] bg-white p-5 sm:p-6">
          <LoginForm initialMode={mode === "signup" ? "signup" : "signin"} next={next ?? ""} />
        </div>
        {demo === "off" && (
          <p role="alert" className="mt-4 rounded-xl bg-[#33414E] px-4 py-3 text-sm text-white">
            The demo could not open just now. Create an account instead, it takes a few seconds.
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[15px]">
          <span className="text-[#B9D3EC]">No account needed to look around.</span>
          <Link
            href="/demo"
            prefetch={false}
            className="inline-flex min-h-11 items-center font-semibold text-white underline decoration-[#B9D3EC] underline-offset-4 hover:decoration-white"
          >
            Open the demo tank
          </Link>
        </div>
      </div>
    </div>
  );
}

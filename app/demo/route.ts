import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Signs the visitor into the shared demo account and opens its tank. The password stays on the server.
// Someone already signed in to their own account keeps it, so a link or embedded image to /demo
// can never swap a real session for the shared one.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && user.app_metadata?.demo !== true) return NextResponse.redirect(new URL("/app", request.url));
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.DEMO_EMAIL ?? "",
    password: process.env.DEMO_PASSWORD ?? "",
  });
  return NextResponse.redirect(new URL(error ? "/login?demo=off" : "/app", request.url));
}

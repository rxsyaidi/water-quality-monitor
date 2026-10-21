"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error: string | null; email: string };

// only paths inside the app, so a crafted ?next= cannot send people elsewhere
const safeNext = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/app") && !s.startsWith("//") ? s : "/app";
};

function plain(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "That email and password do not match an account.";
  if (m.includes("already registered")) return "There is already an account with this email. Sign in instead.";
  if (m.includes("password should be")) return "Use a password of at least 8 characters.";
  if (m.includes("rate limit")) return "Too many tries in a short time. Wait a minute and try again.";
  if (m.includes("valid email") || m.includes("invalid format")) return "Enter a full email address, like name@example.com.";
  return message;
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: plain(error.message), email };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Use a password of at least 8 characters.", email };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: plain(error.message), email };
  // with email confirmation off the session starts at once; if it is ever turned on, say what to do
  if (!data.session) return { error: "Check your email for a link to finish creating the account.", email };
  redirect("/app");
}

export async function signOut(to?: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(to === "signup" ? "/login?mode=signup" : "/login");
}

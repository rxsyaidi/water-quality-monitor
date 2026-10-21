"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

const field =
  "mt-1.5 block h-12 w-full rounded-[10px] border border-line bg-white px-3.5 text-base text-ink outline-none transition-[border-color] duration-150 focus:border-brand";

export function LoginForm({ initialMode, next }: { initialMode: "signin" | "signup"; next: string }) {
  const [mode, setMode] = useState(initialMode);
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, { error: null, email: "" });
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, { error: null, email: "" });
  const signup = mode === "signup";
  const state = signup ? upState : inState;
  const pending = signup ? upPending : inPending;

  return (
    <form action={signup ? upAction : inAction} key={mode}>
      <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">{signup ? "Create an account" : "Sign in"}</h1>
      <p className="mt-1 text-[15px] text-ink-2">
        {signup ? "Your own tank starts with a virtual board, so you can try everything before wiring the real one." : "Welcome back."}
      </p>
      <input type="hidden" name="next" value={next} />
      <label className="mt-5 block text-sm font-medium text-ink">
        Email
        <input className={field} type="email" name="email" autoComplete="email" required defaultValue={state.email} />
      </label>
      <label className="mt-4 block text-sm font-medium text-ink">
        Password
        <input
          className={field}
          type="password"
          name="password"
          autoComplete={signup ? "new-password" : "current-password"}
          minLength={signup ? 8 : undefined}
          required
        />
        {signup && <span className="mt-1.5 block text-[13px] font-normal text-faint">At least 8 characters.</span>}
      </label>
      {state.error && (
        <p role="alert" className="mt-4 flex gap-2 text-[15px] text-unsafe">
          <span aria-hidden="true" className="mt-[7px] size-2 shrink-0 rounded-full bg-unsafe" />
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-brand text-[15px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-brand-deep active:scale-[0.98] disabled:bg-faint"
      >
        {pending ? (signup ? "Creating account…" : "Signing in…") : signup ? "Create account" : "Sign in"}
      </button>
      <p className="mt-4 text-center text-[15px] text-ink-2">
        {signup ? "Already have an account?" : "New here?"}{" "}
        <button
          type="button"
          onClick={() => setMode(signup ? "signin" : "signup")}
          className="inline-flex min-h-11 items-center font-semibold text-brand hover:text-brand-deep"
        >
          {signup ? "Sign in" : "Create an account"}
        </button>
      </p>
    </form>
  );
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server client for components, actions and route handlers. Writing cookies fails inside a server
// component render, which is fine because the middleware already refreshed the session.
export async function createClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {}
        },
      },
    },
  );
}

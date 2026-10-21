"use client";

import { useEffect } from "react";

// Registers the service worker that makes the app installable and opens the last screen offline.
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

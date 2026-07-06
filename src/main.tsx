import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/base.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Dev self-heal: a service worker left registered by an earlier production or
// `vite preview` session on this same origin (localhost:5508) keeps serving
// its cached, cache-first assets — so `npm run dev` edits silently never show
// up no matter how many times the server restarts. In dev, tear any such
// worker + its caches down so the dev server is always the source of truth.
if (!import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  }).catch(() => {});
  if (window.caches) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
  }
}

// Register the service worker (PWA) in production builds only.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Installed PWAs can sit open (or backgrounded) for days without ever
      // re-fetching sw.js, so a deploy never gets noticed on its own — check
      // every time the app comes back to the foreground.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void reg.update();
      });
    }).catch(() => {});
  });

  // A new service worker just took control: the open tab is still running
  // the OLD build's JS in memory, whose lazy chunk URLs no longer exist on
  // the server post-deploy. Reload once to pick up the fresh build instead
  // of risking a broken chunk-load later.
  let reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedForUpdate) return;
    reloadedForUpdate = true;
    window.location.reload();
  });
}

import { useEffect } from "react";

// Keeps a component's data fresh without wasting requests.
// It runs `load` when the component appears, and then again:
//   - instantly, when a live "ride-event" ping arrives
//   - when the person comes back to this browser tab
//   - every `intervalMs` as a safety net, but ONLY while the tab is visible
export function useAutoRefresh(load, intervalMs = 30000) {
  useEffect(() => {
    const visible = () => document.visibilityState === "visible";

    load();

    const timer = setInterval(() => {
      if (visible()) load();
    }, intervalMs);

    const onVisibility = () => {
      if (visible()) load();
    };
    const onPing = () => load();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("ride-event", onPing);

    // Cleanup: stop everything when the component goes away
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("ride-event", onPing);
    };
  }, [load, intervalMs]);
}
"use client";

import { useEffect, useState } from "react";
import { getMe } from "@/lib/me";
import { getRealtimeClient } from "@/lib/supabaseBrowser";

// What to show for each kind of ping
const MESSAGES = {
  "new-request": "New ride request near you",
  accepted: "A driver accepted your ride",
  started: "Your ride has started",
  completed: "Ride completed. Thanks for riding!",
  cancelled: "The ride was cancelled",
  paid: "Payment received for your ride",
  reviewed: "You received a new rating",
  released: "Your driver can't make it. We're finding you another driver.",
  test: "Realtime is working!",
};

export default function Notifications() {
  const [toasts, setToasts] = useState([]); // the pop-ups currently showing

  useEffect(() => {
    let client = null;
    let channel = null;
    let cancelled = false;

    function addToast(text) {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list, { id, text }]);
      // Remove it automatically after 6 seconds
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 6000);
    }

    async function start() {
      try {
        // Who am I? (shared with the sidebar, so it's one request, not two)
        const me = await getMe();
        if (cancelled || !me) return;

        // The realtime library is big, so it's loaded now, after the page is already usable
        client = await getRealtimeClient();
        if (cancelled) return;

        // Open my private channel and listen for pings
        channel = client
          .channel(`user-${me.id}`)
          .on("broadcast", { event: "ride-event" }, ({ payload }) => {
            const text = MESSAGES[payload?.type];
            if (text) addToast(text);

            // Tell the rest of the page that something changed,
            // so cards can refresh themselves right away
            window.dispatchEvent(new CustomEvent("ride-event", { detail: payload }));
          })
          .subscribe((status) => console.log("Realtime:", status));
      } catch {
        // No live updates, but the page still works and refreshes on its own timers
      }
    }

    start();

    // Cleanup: close the channel when the page goes away
    return () => {
      cancelled = true;
      if (client && channel) client.removeChannel(channel);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className="fixed right-4 top-4 z-50 w-72 max-w-[calc(100vw-2rem)] space-y-2"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
          className="block w-full rounded-lg bg-black px-4 py-3 text-left text-sm text-white shadow-lg"
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
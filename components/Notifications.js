"use client";

import { useEffect, useState } from "react";
import { getRealtimeClient } from "@/lib/supabaseBrowser";

// What to show for each kind of ping

const MESSAGES = {
  "new-request": "New ride request near you",
  accepted: "A driver accepted your ride",
  started: "Your ride has started",
  completed: "Ride completed. Thanks for riding!",
  cancelled: "The ride was cancelled",
  paid: "Payment received for your ride",
  test: "Realtime is working!",
};

export default function Notifications() {
  const [toasts, setToasts] = useState([]); // the pop-ups currently showing

  useEffect(() => {
    let channel = null;
    let cancelled = false;

    function addToast(text) {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list, { id, text }]);
      // Remove it automatically after 6 seconds
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 6000);
    }

    async function start() {
      // Who am I? Our server knows from the Clerk login.
      const res = await fetch("/api/users/me");
      if (!res.ok) return;
      const { user } = await res.json();
      if (cancelled) return;

      // Open my private channel and listen for pings
      const supabase = getRealtimeClient();
      channel = supabase
        .channel(`user-${user.id}`)
        .on("broadcast", { event: "ride-event" }, ({ payload }) => {
          const text = MESSAGES[payload?.type];
          if (text) addToast(text);

          // Tell the rest of the page that something changed,
          // so cards can refresh themselves right away
          window.dispatchEvent(new CustomEvent("ride-event", { detail: payload }));
        })
        .subscribe((status) => console.log("Realtime:", status));
    }

    start();

    // Cleanup: close the channel when the page goes away
    return () => {
      cancelled = true;
      if (channel) getRealtimeClient().removeChannel(channel);
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
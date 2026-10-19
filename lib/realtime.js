// Sends a tiny "something happened" ping to one user's live channel.
// It is best effort: if it fails, the app still works, because the pages
// also refresh on a slow timer as a safety net.
export async function notifyUser(userId, type) {
  try {
    const key = process.env.SUPABASE_SECRET_KEY;

    const headers = { apikey: key, "Content-Type": "application/json" };
    // Older JWT-style keys also need an Authorization header
    if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

    const res = await fetch(`${process.env.SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: [
          {
            topic: `user-${userId}`, // the user's private channel
            event: "ride-event",
            payload: { type }, // only the event type, no ride details
            private: false,
          },
        ],
      }),
      signal: AbortSignal.timeout(3000), // give up after 3 seconds
    });

    if (!res.ok) {
      console.warn("Realtime ping failed:", res.status, await res.text());
    }
  } catch (err) {
    // A failed ping must never break a ride action
    console.warn("Realtime ping error:", err.message);
  }
}
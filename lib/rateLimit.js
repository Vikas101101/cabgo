import { supabase } from "@/lib/supabase";

// Counts one request against a limit, such as "10 per 60 seconds" for one user and one action.
// Returns null when the request is allowed, or a ready-made 429 response when it is not.
export async function checkRateLimit(key, max, windowSeconds) {
  try {
    const { data, error } = await supabase.rpc("rate_limit_hit", {
      p_key: key,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    if (error) throw error;

    if (data === false) {
      return Response.json(
        { error: "Too many requests. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(windowSeconds) } }
      );
    }
    return null;
  } catch (err) {
    // If the limiter itself breaks, we let the request through ("fail open") and tell the
    // server log. A broken limiter shouldn't take the whole app down with it.
    console.warn("Rate limiter unavailable:", err.message);
    return null;
  }
}
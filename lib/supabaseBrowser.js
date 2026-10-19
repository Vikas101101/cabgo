import { createClient } from "@supabase/supabase-js";

let client = null;

// One shared connection for the whole page (created the first time it's needed)
export function getRealtimeClient() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return client;
}
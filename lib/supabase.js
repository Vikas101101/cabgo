import { createClient } from "@supabase/supabase-js";

// One shared connection to our database.
// It uses the secret key, so this file must ONLY be used in
// API routes (server code), never in components that run in the browser.
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    // We don't use Supabase's own login system (Clerk does that),
    // so there's no session to remember.
    auth: { persistSession: false },
  }
);
let clientPromise = null;

// One shared connection for the whole page, created the first time it's needed.
// The Supabase library is loaded on demand, so it isn't part of every page's first download.
export function getRealtimeClient() {
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) =>
        createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          { auth: { persistSession: false } }
        )
      )
      .catch((err) => {
        clientPromise = null; // let the next call try again
        throw err;
      });
  }
  return clientPromise;
}
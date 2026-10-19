import { auth, currentUser } from "@clerk/nextjs/server";
import { supabase } from "@/lib/supabase";

// Returns the logged-in person's row from our "users" table.
// If they don't have a row yet, it creates one.
// Returns null if nobody is logged in.
export async function getCurrentUser() {
  // 1. Ask Clerk who is making this request
  const { userId } = await auth();
  if (!userId) return null; // not logged in

  // 2. Look for this person in our own database
  const { data: existing, error: findError } = await supabase
    .from("users")
    .select("*")
    .eq("clerk_id", userId)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing; // found them, done

  // 3. First time we've seen them: get their details from Clerk
  const clerkUser = await currentUser();

  // 4. Create their row in our database
  const { data: created, error } = await supabase
    .from("users")
    .insert({
      clerk_id: userId,
      name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
      email: clerkUser.emailAddresses[0]?.emailAddress ?? null,
    })
    .select()
    .single();

  if (error) {
    // 23505 = "duplicate": another request created the row a moment ago.
    // That's fine, so read the row that now exists.
    if (error.code === "23505") {
      const { data: again, error: againError } = await supabase
        .from("users")
        .select("*")
        .eq("clerk_id", userId)
        .single();
      if (againError) throw againError;
      return again;
    }
    throw error;
  }

  return created;
}
import { getCurrentUser } from "@/lib/getCurrentUser";
import { fail, readJson } from "@/lib/http";
import { supabase } from "@/lib/supabase";

const DAYS = 30; // only recent rides are offered for rating
const MAX_SHOWN = 5;

// Show only a first name, for privacy
const firstName = (name) => (name ? name.split(" ")[0] : null);

// GET /api/reviews/pending → the rider's recent completed rides that haven't been rated
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    // Only riders rate. For anyone else, there's simply nothing to show.
    if (user.role !== "rider") {
      return Response.json({ rides: [] });
    }

    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: rides, error } = await supabase
      .from("rides")
      .select("id, pickup_address, dropoff_address, driver_id, updated_at")
      .eq("rider_id", user.id)
      .eq("status", "completed")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw error;

    if (!rides || rides.length === 0) {
      return Response.json({ rides: [] });
    }

    // Which of these have already been rated?
    const { data: reviewed, error: reviewedError } = await supabase
      .from("reviews")
      .select("ride_id")
      .in("ride_id", rides.map((r) => r.id));
    if (reviewedError) throw reviewedError;

    const done = new Set((reviewed ?? []).map((r) => r.ride_id));
    const pending = rides.filter((r) => r.driver_id && !done.has(r.id)).slice(0, MAX_SHOWN);

    if (pending.length === 0) {
      return Response.json({ rides: [] });
    }

    // The drivers' first names, so the prompt can say "How was your ride with Dev?"
    const { data: drivers, error: driversError } = await supabase
      .from("users")
      .select("id, name")
      .in("id", [...new Set(pending.map((r) => r.driver_id))]);
    if (driversError) throw driversError;

    const names = new Map((drivers ?? []).map((d) => [d.id, firstName(d.name)]));

    // Ids of people stay on the server. We send only what the page needs.
    return Response.json({
      rides: pending.map((r) => ({
        id: r.id,
        pickup_address: r.pickup_address,
        dropoff_address: r.dropoff_address,
        completed_at: r.updated_at,
        driver_name: names.get(r.driver_id) ?? null,
      })),
    });
  } catch (err) {
    return fail(err);
  }
}
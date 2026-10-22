import { getCurrentUser } from "@/lib/getCurrentUser";
import { supabase } from "@/lib/supabase";
import { ratingSummary } from "@/lib/ratings";

// GET /api/reviews/driver → the logged-in driver's average rating and latest reviews
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }
    if (user.role !== "driver") {
      return Response.json({ error: "Only drivers have a rating" }, { status: 403 });
    }

    const { data: driver, error: driverError } = await supabase
      .from("drivers")
      .select("rating_sum, rating_count")
      .eq("user_id", user.id)
      .maybeSingle();
    if (driverError) throw driverError;

    // Reviews are anonymous: no rider id, no rider name
    const { data: reviews, error: reviewsError } = await supabase
      .from("reviews")
      .select("rating, comment, created_at")
      .eq("driver_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (reviewsError) throw reviewsError;

    return Response.json({
      summary: ratingSummary(driver?.rating_sum, driver?.rating_count),
      reviews: reviews ?? [],
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
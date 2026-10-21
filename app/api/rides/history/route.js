import { getCurrentUser } from "@/lib/getCurrentUser";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 10;

// The filters the page can ask for. Anything else means "all rides".
const FILTERS = {
  completed: ["completed"],
  cancelled: ["cancelled"],
  active: ["requested", "accepted", "in_progress"],
};

// GET /api/rides/history?status=all|completed|cancelled|active&page=1
export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Only accept a filter name that we know. Object.hasOwn stops odd values
    // like "constructor" from slipping through.
    const filter = searchParams.get("status") ?? "";
    const statuses = Object.hasOwn(FILTERS, filter) ? FILTERS[filter] : null;

    // The page number must be a whole number from 1 to 1000
    const rawPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const page = Number.isInteger(rawPage) && rawPage >= 1 ? Math.min(rawPage, 1000) : 1;

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Riders see rides they booked, and drivers see rides they drove
    const mine = user.role === "driver" ? "driver_id" : "rider_id";

    let query = supabase
      .from("rides")
      .select(
        "id, status, pickup_address, dropoff_address, distance_km, duration_min, fare, ride_type, created_at, updated_at",
        { count: "exact" }
      )
      .eq(mine, user.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (statuses) query = query.in("status", statuses);

    const { data, count, error } = await query;

    // PGRST103 means "that page is past the end of the list". Show an empty page.
    if (error?.code === "PGRST103") {
      return Response.json({
        role: user.role, rides: [], page, page_size: PAGE_SIZE, total: 0, total_pages: 1,
      });
    }
    if (error) throw error;

    const rides = data ?? [];

    // Which of these rides have a successful payment?
    let paidBy = new Map();
    if (rides.length > 0) {
      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select("ride_id, driver_earning")
        .in("ride_id", rides.map((r) => r.id))
        .eq("status", "succeeded");
      if (paymentsError) throw paymentsError;
      paidBy = new Map((payments ?? []).map((p) => [p.ride_id, p]));
    }

    const result = rides.map((ride) => {
      const payment = paidBy.get(ride.id);
      const row = { ...ride, paid: Boolean(payment) };
      // Only a driver sees their share of the payment
      if (user.role === "driver" && payment) row.earning = Number(payment.driver_earning);
      return row;
    });

    return Response.json({
      role: user.role,
      rides: result,
      page,
      page_size: PAGE_SIZE,
      total: count ?? 0,
      total_pages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
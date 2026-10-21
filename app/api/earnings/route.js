import { getCurrentUser } from "@/lib/getCurrentUser";
import { supabase } from "@/lib/supabase";
import { toPaise } from "@/lib/payments";

// GET /api/earnings → what the logged-in driver has earned from paid rides
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }
    if (user.role !== "driver") {
      return Response.json({ error: "Only drivers have earnings" }, { status: 403 });
    }

    // Successful payments for rides this driver drove
    const { data, error } = await supabase
      .from("payments")
      .select(
        "amount, driver_earning, created_at, updated_at, rides!inner(driver_id, pickup_address, dropoff_address)"
      )
      .eq("status", "succeeded")
      .eq("rides.driver_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const rows = data ?? [];
    const paidAt = (r) => r.updated_at ?? r.created_at;

    // Add up in paise (whole numbers) so there are no rounding errors
    const totalPaise = rows.reduce((sum, r) => sum + toPaise(r.driver_earning), 0);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekPaise = rows
      .filter((r) => new Date(paidAt(r)).getTime() >= weekAgo)
      .reduce((sum, r) => sum + toPaise(r.driver_earning), 0);

    return Response.json({
      summary: {
        total: totalPaise / 100,
        last_7_days: weekPaise / 100,
        rides: rows.length,
        average: rows.length ? Math.round(totalPaise / rows.length) / 100 : 0,
      },
      payments: rows.slice(0, 20).map((r) => ({
        pickup_address: r.rides.pickup_address,
        dropoff_address: r.rides.dropoff_address,
        fare: Number(r.amount),
        earning: Number(r.driver_earning),
        paid_at: paidAt(r),
      })),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
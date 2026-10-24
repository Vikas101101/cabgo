import { getCurrentUser } from "@/lib/getCurrentUser";
import { fail, readJson } from "@/lib/http";
import { supabase } from "@/lib/supabase";
import { createRazorpayOrder, splitFare } from "@/lib/payments";
import { checkRateLimit } from "@/lib/rateLimit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/payments/create-order → start paying for a completed ride
// Body: { "ride_id": "..." }
export async function POST(request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }
    if (user.role !== "rider") {
      return Response.json({ error: "Only riders can pay for rides" }, { status: 403 });
    }

    const limited = await checkRateLimit(`pay:${user.id}`, 10, 600);
      if (limited) return limited;

    const { ride_id } = await readJson(request);
    if (!UUID.test(String(ride_id))) {
      return Response.json({ error: "Invalid ride id" }, { status: 400 });
    }

    // The ride must be this rider's, and completed
    const { data: ride, error: rideError } = await supabase
      .from("rides")
      .select("id, rider_id, status, fare")
      .eq("id", ride_id)
      .maybeSingle();
    if (rideError) throw rideError;

    // Same answer for "doesn't exist" and "not yours", so ids can't be probed
    if (!ride || ride.rider_id !== user.id) {
      return Response.json({ error: "Ride not found" }, { status: 404 });
    }
    if (ride.status !== "completed") {
      return Response.json({ error: "This ride isn't completed yet" }, { status: 409 });
    }
    if (!ride.fare || Number(ride.fare) <= 0) {
      return Response.json({ error: "This ride has no fare" }, { status: 400 });
    }

    // Already paid?
    const { data: paid, error: paidError } = await supabase
      .from("payments")
      .select("id")
      .eq("ride_id", ride.id)
      .eq("status", "succeeded")
      .limit(1);
    if (paidError) throw paidError;
    if (paid.length > 0) {
      return Response.json({ error: "This ride is already paid" }, { status: 409 });
    }

    // The amount comes from OUR database, never from the browser
    const split = splitFare(ride.fare);
    const order = await createRazorpayOrder({
      amountPaise: split.totalPaise,
      receipt: ride.id,
      notes: { ride_id: ride.id },
    });

    // Remember this order, waiting to be paid
    const { error: insertError } = await supabase.from("payments").insert({
      ride_id: ride.id,
      amount: ride.fare,
      currency: "inr",
      status: "pending",
      provider: "razorpay",
      provider_order_id: order.id,
      platform_fee: split.platformFee,
      driver_earning: split.driverEarning,
    });
    if (insertError) throw insertError;

    // Everything the browser needs to open the payment pop-up
    return Response.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID, // the Key Id is public. The secret never leaves the server
    });
  } catch (err) {
    return fail(err);
  }
}
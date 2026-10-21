import { supabase } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Show only a first name, for privacy
const firstName = (name) => (name ? name.split(" ")[0] : null);

// Turns a ride and its payment into the plain data a receipt needs.
// It picks fields one by one, so internal details (user ids, the platform's
// commission, the driver's share) can never leak into a receipt.
export function buildReceipt({ ride, payment, rider, driver }) {
  return {
    // "CG-" plus the first 8 characters of the payment id, for example CG-A1B2C3D4
    receipt_number: `CG-${String(payment.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`,
    ride_id: ride.id,
    paid_at: payment.updated_at ?? payment.created_at,
    ride_date: ride.created_at,
    rider: { name: rider.name ?? null, email: rider.email ?? null },
    driver: driver
      ? {
          name: driver.name ?? null,
          vehicle_model: driver.vehicle_model ?? null,
          vehicle_number: driver.vehicle_number ?? null,
        }
      : null,
    pickup_address: ride.pickup_address,
    dropoff_address: ride.dropoff_address,
    ride_type: ride.ride_type,
    distance_km: Number(ride.distance_km),
    duration_min: ride.duration_min === null ? null : Number(ride.duration_min),
    amount: Number(payment.amount), // what the rider actually paid
    currency: String(payment.currency || "inr").toUpperCase(),
    payment_reference: payment.provider_payment_id ?? null,
  };
}

// Finds a ride's receipt for the logged-in user.
// Returns { receipt } on success, or { status, error } when something is wrong.
export async function loadReceipt(user, rideId) {
  if (user.role !== "rider") {
    return { status: 403, error: "Only riders get receipts" };
  }
  if (!UUID.test(String(rideId))) {
    return { status: 400, error: "Invalid ride id" };
  }

  const { data: ride, error: rideError } = await supabase
    .from("rides")
    .select(
      "id, rider_id, driver_id, pickup_address, dropoff_address, distance_km, duration_min, fare, ride_type, created_at, updated_at"
    )
    .eq("id", rideId)
    .maybeSingle();
  if (rideError) throw rideError;

  // The same answer for "doesn't exist" and "not yours", so ids can't be probed
  if (!ride || ride.rider_id !== user.id) {
    return { status: 404, error: "Receipt not found" };
  }

  // The receipt exists only for a ride with a successful payment
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, amount, currency, provider_payment_id, created_at, updated_at")
    .eq("ride_id", ride.id)
    .eq("status", "succeeded")
    .maybeSingle();
  if (paymentError) throw paymentError;

  if (!payment) {
    return { status: 409, error: "This ride hasn't been paid yet" };
  }

  // The driver's first name and vehicle (best effort: a receipt works without them)
  let driver = null;
  if (ride.driver_id) {
    const { data: u } = await supabase
      .from("users")
      .select("name")
      .eq("id", ride.driver_id)
      .maybeSingle();
    const { data: d } = await supabase
      .from("drivers")
      .select("vehicle_model, vehicle_number")
      .eq("user_id", ride.driver_id)
      .maybeSingle();
    driver = {
      name: firstName(u?.name),
      vehicle_model: d?.vehicle_model ?? null,
      vehicle_number: d?.vehicle_number ?? null,
    };
  }

  return { receipt: buildReceipt({ ride, payment, rider: user, driver }) };
}
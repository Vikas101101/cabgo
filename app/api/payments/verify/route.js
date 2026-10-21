import { getCurrentUser } from "@/lib/getCurrentUser";
import { supabase } from "@/lib/supabase";
import { verifyPaymentSignature } from "@/lib/payments";
import { notifyUser } from "@/lib/realtime";

// Razorpay ids look like "order_Abc123" and "pay_Xyz789"
const ID = /^[A-Za-z0-9_]{5,60}$/;

// POST /api/payments/verify → confirm that a payment really happened
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
export async function POST(request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }
    if (user.role !== "rider") {
      return Response.json({ error: "Only riders can pay for rides" }, { status: 403 });
    }

    const body = await request.json();
    const orderId = String(body.razorpay_order_id ?? "");
    const paymentId = String(body.razorpay_payment_id ?? "");
    const signature = String(body.razorpay_signature ?? "");

    if (!ID.test(orderId) || !ID.test(paymentId) || signature.length < 10 || signature.length > 200) {
      return Response.json({ error: "Invalid payment details" }, { status: 400 });
    }

    // Find the payment we created for this order, and make sure it's this rider's
    const { data: payment, error: findError } = await supabase
      .from("payments")
      .select("id, status, rides!inner(rider_id, driver_id)")
      .eq("provider_order_id", orderId)
      .maybeSingle();
    if (findError) throw findError;

    if (!payment || payment.rides.rider_id !== user.id) {
      return Response.json({ error: "Payment not found" }, { status: 404 });
    }

    // Already confirmed (for example by a webhook): nothing more to do
    if (payment.status === "succeeded") {
      return Response.json({ status: "succeeded" });
    }

    // The important check: is this proof genuine?
    const genuine = verifyPaymentSignature({
      orderId,
      paymentId,
      signature,
      secret: process.env.RAZORPAY_KEY_SECRET,
    });
    if (!genuine) {
      return Response.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    // Mark it as paid. The database also guarantees one successful payment per ride.
    const { data: updated, error: updateError } = await supabase
      .from("payments")
      .update({
        status: "succeeded",
        provider_payment_id: paymentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .neq("status", "succeeded")
      .select("id");

    if (updateError) {
      // 23505 = the ride already has a successful payment from another order
      if (updateError.code === "23505") {
        return Response.json({ error: "This ride is already paid" }, { status: 409 });
      }
      throw updateError;
    }

    // Tell the driver that the money arrived (best effort)
    if (updated.length > 0 && payment.rides.driver_id) {
      await notifyUser(payment.rides.driver_id, "paid");
    }

    return Response.json({ status: "succeeded" });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
import { supabase } from "@/lib/supabase";
import { toPaise, verifyWebhookSignature } from "@/lib/payments";
import { notifyUser } from "@/lib/realtime";

// POST /api/payments/webhook → Razorpay tells us a payment was captured.
// There is no login here: the SIGNATURE is the proof that Razorpay sent it.
export async function POST(request) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      return Response.json({ error: "Webhook is not configured" }, { status: 500 });
    }

    // Read the raw text FIRST. The signature is calculated over exactly these bytes.
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      return Response.json({ error: "Invalid signature" }, { status: 400 });
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    // We only care about captured payments. Acknowledge everything else.
    // (Answering 200 stops Razorpay from retrying events we don't use.)
    if (event.event !== "payment.captured") {
      return Response.json({ received: true });
    }

    const entity = event.payload?.payment?.entity;
    const orderId = entity?.order_id;
    const paymentId = entity?.id;
    if (!orderId || !paymentId) {
      return Response.json({ received: true });
    }

    // Find the payment we created for this order
    const { data: payment, error: findError } = await supabase
      .from("payments")
      .select("id, status, amount, currency, rides!inner(driver_id)")
      .eq("provider_order_id", orderId)
      .maybeSingle();
    if (findError) throw findError;

    // Not one of ours: acknowledge so Razorpay doesn't keep retrying
    if (!payment) {
      return Response.json({ received: true });
    }

    // Already confirmed (for example by the browser): nothing to do
    if (payment.status === "succeeded") {
      return Response.json({ received: true });
    }

    // Safety check: the money received must match what we asked for
    const sameAmount = Number(entity.amount) === toPaise(payment.amount);
    const sameCurrency = String(entity.currency).toLowerCase() === String(payment.currency).toLowerCase();
    if (!sameAmount || !sameCurrency) {
      console.error("Webhook amount mismatch for order", orderId, entity.amount, entity.currency);
      return Response.json({ received: true });
    }

    // Mark it paid, but only if it isn't already
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
      // 23505: this ride already has a successful payment from another order
      if (updateError.code === "23505") {
        console.error("Webhook: ride already paid, order", orderId);
        return Response.json({ received: true });
      }
      throw updateError;
    }

    if (updated.length > 0 && payment.rides.driver_id) {
      await notifyUser(payment.rides.driver_id, "paid");
    }

    return Response.json({ received: true });
  } catch (err) {
    // A real failure: answer 500 so Razorpay retries later
    console.error("Webhook error:", err.message);
    return Response.json({ error: "Webhook failed" }, { status: 500 });
  }
}
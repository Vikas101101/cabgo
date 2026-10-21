import crypto from "node:crypto";

// Usage: node --env-file=.env.local scripts/test-webhook.mjs <order_id> <payment_id> <amount_in_paise>
const [orderId, paymentId, amountPaise] = process.argv.slice(2);
const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

if (!orderId || !paymentId || !amountPaise || !secret) {
  console.log("Usage: node --env-file=.env.local scripts/test-webhook.mjs <order_id> <payment_id> <amount_in_paise>");
  process.exit(1);
}

const body = JSON.stringify({
  event: "payment.captured",
  payload: {
    payment: {
      entity: { id: paymentId, order_id: orderId, amount: Number(amountPaise), currency: "INR", status: "captured" },
    },
  },
});

const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

const res = await fetch("http://localhost:3000/api/payments/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Razorpay-Signature": signature },
  body,
});

console.log(res.status, await res.text());

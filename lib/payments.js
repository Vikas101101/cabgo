import { httpError } from "@/lib/http";
import crypto from "node:crypto";

// The platform keeps 20% of each fare, and the driver gets 80%.
export const PLATFORM_FEE_RATE = 0.2;

// Razorpay counts money in paise (100 paise = 1 rupee), as whole numbers.
export function toPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}

// Splits a fare (in rupees) into the platform's share and the driver's share.
// We work in paise so there are no rounding errors, and the two parts always add up exactly.
export function splitFare(rupees) {
  const totalPaise = toPaise(rupees);
  const platformPaise = Math.round(totalPaise * PLATFORM_FEE_RATE);
  const driverPaise = totalPaise - platformPaise;
  return {
    totalPaise,
    platformFee: platformPaise / 100,
    driverEarning: driverPaise / 100,
  };
}

// Checks the proof of payment that Razorpay's pop-up gives the browser.
// Only Razorpay and our server know the secret, so only a real payment
// produces a signature that matches.
export function verifyPaymentSignature({ orderId, paymentId, signature, secret }) {
  if (!orderId || !paymentId || !signature || !secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));

  // timingSafeEqual needs equal lengths, and compares in constant time
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Asks Razorpay to create an order for an amount (in paise).
export async function createRazorpayOrder({ amountPaise, receipt, notes }) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !secret) {
    console.error("Razorpay keys are missing from the environment");
    throw httpError(503, "Payments are not available right now.");
  }

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Razorpay uses "Basic" login: the key id and secret, joined and encoded
      Authorization: "Basic " + Buffer.from(`${keyId}:${secret}`).toString("base64"),
    },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, notes }),
    signal: AbortSignal.timeout(10000), // give up after 10 seconds
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Log the real reason for us, but show the rider a plain message
    console.error("Razorpay order failed:", res.status, data?.error?.description);
    throw httpError(502, "Could not start the payment. Please try again.");
  }

  return data; // includes the order id
}

// Checks that a webhook really came from Razorpay.
// The signature is an HMAC of the RAW request text, made with the webhook secret.
export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
import { supabase } from "@/lib/supabase";
import { loadReceipt } from "@/lib/receipt";
import { emailConfigured, sendEmail } from "@/lib/email";

const COOLDOWN_MS = 60 * 1000; // a receipt can be re-sent at most once a minute

// Makes text safe to put inside HTML, so a value like <script> is shown as text
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// asha@example.com becomes a***@example.com
export function maskEmail(email) {
  const [name, domain] = String(email ?? "").split("@");
  if (!name || !domain) return "your email";
  return `${name[0]}***@${domain}`;
}

const formatMoney = (amount, currency) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount);

// The server runs in UTC, so we ask for Indian time explicitly
const formatDate = (iso) =>
  new Date(iso).toLocaleString("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });

const capitalize = (s) => String(s ?? "").charAt(0).toUpperCase() + String(s ?? "").slice(1);

// Builds the subject, the HTML and the plain-text version of a receipt email
export function renderReceiptEmail(receipt) {
  const total = formatMoney(receipt.amount, receipt.currency);

  // [label, value] pairs shown as rows
  const rows = [
    ["Date", formatDate(receipt.ride_date)],
    ["From", receipt.pickup_address],
    ["To", receipt.dropoff_address],
    ["Ride type", capitalize(receipt.ride_type)],
    ["Distance", `${receipt.distance_km} km`],
  ];
  if (receipt.duration_min !== null) {
    rows.push(["Travel time", `${Math.round(receipt.duration_min)} min`]);
  }
  if (receipt.driver) {
    const vehicle = [receipt.driver.vehicle_model, receipt.driver.vehicle_number]
      .filter(Boolean)
      .join(" · ");
    rows.push(["Driver", [receipt.driver.name || "Your driver", vehicle].filter(Boolean).join(", ")]);
  }
  if (receipt.payment_reference) {
    rows.push(["Payment reference", receipt.payment_reference]);
  }

  const subject = `Your CabGo receipt ${receipt.receipt_number}`;

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:8px 0;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
      <tr>
        <td>
          <p style="margin:0;font-size:22px;font-weight:bold;">🚕 CabGo</p>
          <p style="margin:4px 0 0;color:#6b7280;font-size:14px;">Ride receipt</p>
        </td>
        <td style="text-align:right;font-size:14px;">
          <strong>${escapeHtml(receipt.receipt_number)}</strong><br />
          <span style="color:#6b7280;">${escapeHtml(formatDate(receipt.paid_at))}</span>
        </td>
      </tr>
      <tr><td colspan="2" style="padding-top:16px;border-bottom:1px solid #e5e7eb;"></td></tr>
      <tr>
        <td colspan="2" style="padding-top:16px;font-size:14px;">
          Hi ${escapeHtml(receipt.rider.name || "there")}, thanks for riding with CabGo. Here is your receipt.
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
            ${rowsHtml}
            <tr><td colspan="2" style="border-top:1px solid #e5e7eb;"></td></tr>
            <tr>
              <td style="padding:12px 0;font-size:18px;font-weight:bold;">Total paid</td>
              <td style="padding:12px 0;font-size:18px;font-weight:bold;text-align:right;">${escapeHtml(total)}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top:16px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;">
          This is a demo receipt for a learning project. Payments were made in test mode and
          no real money was charged. It is not a tax invoice.
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "CabGo ride receipt",
    receipt.receipt_number,
    `Paid on ${formatDate(receipt.paid_at)}`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Total paid: ${total}`,
    "",
    "This is a demo receipt for a learning project. No real money was charged. It is not a tax invoice.",
  ].join("\n");

  return { subject, html, text };
}

// Marks "a receipt was sent" on a ride's payment, but only if the condition holds.
// Returns true if THIS call won the claim.
async function claim(rideId, now, addCondition) {
  let query = supabase
    .from("payments")
    .update({ receipt_sent_at: now.toISOString() })
    .eq("ride_id", rideId)
    .eq("status", "succeeded");
  query = addCondition(query);

  const { data, error } = await query.select("id");
  if (error) throw error;
  return data.length > 0;
}

// Puts the claim back, so a failed send can be tried again later
async function release(rideId, value) {
  try {
    await supabase
      .from("payments")
      .update({ receipt_sent_at: value })
      .eq("ride_id", rideId)
      .eq("status", "succeeded");
  } catch (err) {
    console.warn("Could not release receipt claim:", err.message);
  }
}

// Emails the receipt for one ride to its rider.
//   manual = false: sent right after payment, at most once
//   manual = true:  the rider pressed the button, at most once a minute
// Returns { ok: true, to } or { ok: false, code, status, message }.
export async function sendReceiptEmail({ rider, rideId, manual = false }) {
  // 1. The receipt must exist: the rider owns the ride, and it's paid
  const loaded = await loadReceipt(rider, rideId);
  if (loaded.error) {
    return { ok: false, code: "receipt_unavailable", status: loaded.status, message: loaded.error };
  }

  const to = rider.email;
  if (!to) {
    return { ok: false, code: "no_email", status: 400, message: "Your account has no email address." };
  }
  if (!emailConfigured()) {
    return { ok: false, code: "not_configured", status: 503, message: "Email isn't set up on this server." };
  }

  // 2. Claim the send. Whoever wins the update sends the email.
  const now = new Date();
  let restoreTo = null; // what to put back if sending fails

  let claimed = await claim(rideId, now, (q) => q.is("receipt_sent_at", null));

  if (!claimed && manual) {
    // Already sent before. A manual resend is allowed after the cooldown.
    const cutoff = new Date(now.getTime() - COOLDOWN_MS).toISOString();
    claimed = await claim(rideId, now, (q) => q.lt("receipt_sent_at", cutoff));
    restoreTo = cutoff;
  }

  if (!claimed) {
    return manual
      ? { ok: false, code: "too_soon", status: 429, message: "Please wait a minute before sending the receipt again." }
      : { ok: false, code: "already_sent", status: 409, message: "A receipt was already emailed for this payment." };
  }

  // 3. Send it
  const { subject, html, text } = renderReceiptEmail(loaded.receipt);

  let sent;
  try {
    sent = await sendEmail({ to, subject, html, text });
  } catch (err) {
    sent = { ok: false, code: "delivery_failed", status: 0, detail: err.message };
  }

  if (!sent.ok) {
    await release(rideId, restoreTo); // allow a later retry

    const sandboxLimit = sent.status === 403 && /own email/i.test(sent.detail ?? "");
    return {
      ok: false,
      code: "delivery_failed",
      status: 502,
      message: sandboxLimit
        ? "The email service only allows test emails to the account owner's address right now."
        : "We couldn't send the email. Please try again later.",
    };
  }

  return { ok: true, to };
}

// Called right after a payment succeeds. It never throws and never blocks the payment.
export async function emailReceiptAfterPayment({ rideId, riderId }) {
  try {
    const { data: rider, error } = await supabase
      .from("users")
      .select("id, role, name, email")
      .eq("id", riderId)
      .maybeSingle();
    if (error) throw error;
    if (!rider) return;

    const result = await sendReceiptEmail({ rider, rideId, manual: false });

    // These two are normal, so they aren't worth a warning
    if (!result.ok && result.code !== "already_sent" && result.code !== "not_configured") {
      console.warn("Receipt email not sent:", result.code, result.message);
    }
  } catch (err) {
    console.warn("Receipt email error:", err.message);
  }
}
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  escapeHtml,
  maskEmail,
  renderReceiptEmail,
  sendReceiptEmail,
  emailReceiptAfterPayment,
} from "@/lib/receiptEmail";
import { loadReceipt } from "@/lib/receipt";
import { emailConfigured, sendEmail } from "@/lib/email";
import { fake, RIDER } from "./helpers/fake.js";

// The receipt lookup and the email service are faked. We test the logic around them.
vi.mock("@/lib/receipt", () => ({ loadReceipt: vi.fn() }));
vi.mock("@/lib/email", () => ({ emailConfigured: vi.fn(), sendEmail: vi.fn() }));

const RIDER_ROW = { ...RIDER, email: "asha@example.com" };

const RECEIPT = {
  receipt_number: "CG-A1B2C3D4",
  ride_id: "ride-1",
  paid_at: "2026-10-20T08:42:00Z",
  ride_date: "2026-10-20T08:00:00Z",
  rider: { name: "Asha Rider", email: "asha@example.com" },
  driver: { name: "Dev", vehicle_model: "Maruti Swift", vehicle_number: "MH12 AB 1234" },
  pickup_address: "Shivajinagar, Pune",
  dropoff_address: "Hinjewadi, Pune",
  ride_type: "car",
  distance_km: 14.2,
  duration_min: 30.5,
  amount: 269,
  currency: "INR",
  payment_reference: "pay_XYZ789",
};

const paymentUpdates = () => fake.ops("payments").filter((o) => o.method === "update");

beforeEach(() => {
  loadReceipt.mockResolvedValue({ receipt: RECEIPT });
  emailConfigured.mockReturnValue(true);
  sendEmail.mockResolvedValue({ ok: true, id: "email_1" });
});

describe("escapeHtml", () => {
  it("turns special characters into harmless text", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;"
    );
  });

  it("copes with missing values", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("maskEmail", () => {
  it("hides most of the name", () => {
    expect(maskEmail("asha@example.com")).toBe("a***@example.com");
  });

  it("gives a neutral phrase for a broken address", () => {
    expect(maskEmail("nonsense")).toBe("your email");
    expect(maskEmail(null)).toBe("your email");
  });
});

describe("renderReceiptEmail", () => {
  it("includes the receipt number, the amount and the trip", () => {
    const { subject, html, text } = renderReceiptEmail(RECEIPT);
    expect(subject).toBe("Your CabGo receipt CG-A1B2C3D4");
    expect(html).toContain("CG-A1B2C3D4");
    expect(html).toContain("269.00");
    expect(html).toContain("Shivajinagar, Pune");
    expect(text).toContain("Hinjewadi, Pune");
    expect(text).toContain("Total paid");
  });

  it("escapes anything a user could have typed", () => {
    const { html } = renderReceiptEmail({
      ...RECEIPT,
      pickup_address: "<script>alert(1)</script>",
      rider: { name: '"><img src=x onerror=alert(1)>', email: "a@b.com" },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("never includes the internal ride id", () => {
    const { html, text } = renderReceiptEmail(RECEIPT);
    expect(html).not.toContain("ride-1");
    expect(text).not.toContain("ride-1");
  });

  it("works without a driver", () => {
    const { html } = renderReceiptEmail({ ...RECEIPT, driver: null });
    expect(html).not.toContain("Maruti Swift");
  });

  it("shows the date in Indian time", () => {
    // 08:42 UTC is 2:12 pm in India
    expect(renderReceiptEmail(RECEIPT).text).toMatch(/2:12\s?pm/i);
  });
});

describe("sendReceiptEmail", () => {
  it("claims the send, then emails the rider's own address", async () => {
    fake.queue("payments", { data: [{ id: "p1" }], error: null });

    const result = await sendReceiptEmail({ rider: RIDER_ROW, rideId: "ride-1" });

    expect(result).toEqual({ ok: true, to: "asha@example.com" });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "asha@example.com", subject: "Your CabGo receipt CG-A1B2C3D4" })
    );
    // The claim only works when nothing was sent before
    expect(fake.ops("payments")).toContainEqual({ method: "is", args: ["receipt_sent_at", null] });
  });

  it("does not send a second automatic receipt", async () => {
    fake.queue("payments", { data: [], error: null }); // someone already claimed it

    const result = await sendReceiptEmail({ rider: RIDER_ROW, rideId: "ride-1" });

    expect(result).toMatchObject({ ok: false, code: "already_sent", status: 409 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("lets a manual resend through after the cooldown", async () => {
    fake.queue("payments", { data: [], error: null }); // already sent once
    fake.queue("payments", { data: [{ id: "p1" }], error: null }); // but long enough ago

    const result = await sendReceiptEmail({ rider: RIDER_ROW, rideId: "ride-1", manual: true });

    expect(result.ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(fake.ops("payments").some((o) => o.method === "lt" && o.args[0] === "receipt_sent_at")).toBe(true);
  });

  it("refuses a manual resend inside the cooldown", async () => {
    fake.queue("payments", { data: [], error: null });
    fake.queue("payments", { data: [], error: null });

    const result = await sendReceiptEmail({ rider: RIDER_ROW, rideId: "ride-1", manual: true });

    expect(result).toMatchObject({ ok: false, code: "too_soon", status: 429 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("passes on the receipt problem, and doesn't touch the claim", async () => {
    loadReceipt.mockResolvedValue({ status: 409, error: "This ride hasn't been paid yet" });

    const result = await sendReceiptEmail({ rider: RIDER_ROW, rideId: "ride-1" });

    expect(result).toMatchObject({ ok: false, status: 409, message: "This ride hasn't been paid yet" });
    expect(fake.calls).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses when the account has no email address, without claiming", async () => {
    const result = await sendReceiptEmail({ rider: { ...RIDER_ROW, email: null }, rideId: "ride-1" });
    expect(result).toMatchObject({ ok: false, code: "no_email", status: 400 });
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses when email isn't set up, without claiming", async () => {
    emailConfigured.mockReturnValue(false);
    const result = await sendReceiptEmail({ rider: RIDER_ROW, rideId: "ride-1" });
    expect(result).toMatchObject({ ok: false, code: "not_configured", status: 503 });
    expect(fake.calls).toHaveLength(0);
  });

  it("puts the claim back when delivery fails, so it can be retried", async () => {
    sendEmail.mockResolvedValue({ ok: false, code: "delivery_failed", status: 500, detail: "boom" });
    fake.queue("payments", { data: [{ id: "p1" }], error: null }); // the claim
    fake.queue("payments", { data: null, error: null }); // the release

    const result = await sendReceiptEmail({ rider: RIDER_ROW, rideId: "ride-1" });

    expect(result).toMatchObject({ ok: false, code: "delivery_failed", status: 502 });
    const updates = paymentUpdates();
    expect(updates).toHaveLength(2);
    expect(updates[1].args[0]).toEqual({ receipt_sent_at: null });
  });

  it("explains the test-email limit in plain words", async () => {
    sendEmail.mockResolvedValue({
      ok: false,
      code: "delivery_failed",
      status: 403,
      detail: "You can only send testing emails to your own email address",
    });
    fake.queue("payments", { data: [{ id: "p1" }], error: null });
    fake.queue("payments", { data: null, error: null });

    const result = await sendReceiptEmail({ rider: RIDER_ROW, rideId: "ride-1" });

    expect(result.message).toMatch(/account owner/);
  });
});

describe("emailReceiptAfterPayment", () => {
  it("looks up the rider and sends the receipt", async () => {
    fake.queue("users", { data: RIDER_ROW, error: null });
    fake.queue("payments", { data: [{ id: "p1" }], error: null });

    await emailReceiptAfterPayment({ rideId: "ride-1", riderId: RIDER.id });

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does nothing, quietly, when the rider can't be found", async () => {
    fake.queue("users", { data: null, error: null });

    await expect(
      emailReceiptAfterPayment({ rideId: "ride-1", riderId: "ghost" })
    ).resolves.toBeUndefined();

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("never throws, even when sending blows up", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sendEmail.mockRejectedValue(new Error("boom"));
    fake.queue("users", { data: RIDER_ROW, error: null });
    fake.queue("payments", { data: [{ id: "p1" }], error: null }); // the claim
    fake.queue("payments", { data: null, error: null }); // the release

    await expect(
      emailReceiptAfterPayment({ rideId: "ride-1", riderId: RIDER.id })
    ).resolves.toBeUndefined();

    warn.mockRestore();
  });
});
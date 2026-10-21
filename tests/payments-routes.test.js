import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import { POST as createOrder } from "@/app/api/payments/create-order/route.js";
import { POST as verify } from "@/app/api/payments/verify/route.js";
import { POST as webhook } from "@/app/api/payments/webhook/route.js";
import { GET as earnings } from "@/app/api/earnings/route.js";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { createRazorpayOrder } from "@/lib/payments";
import { notifyUser } from "@/lib/realtime";
import { fake, jsonRequest, RIDER, DRIVER } from "./helpers/fake.js";
import { emailReceiptAfterPayment } from "@/lib/receiptEmail";

// Keep the real money helpers, but never call the real Razorpay
vi.mock("@/lib/payments", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createRazorpayOrder: vi.fn() };
});

// Never send real emails from these tests
vi.mock("@/lib/receiptEmail", () => ({ emailReceiptAfterPayment: vi.fn() }));

process.env.RAZORPAY_KEY_SECRET = "test_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret";

const sign = (text, secret) => crypto.createHmac("sha256", secret).update(text).digest("hex");

const RIDE_ID = "3f2a9c1e-5b7d-4e8f-9a6b-1c2d3e4f5a6b";
const ORDER = "order_ABC123";
const PAY = "pay_XYZ789";
const COMPLETED_RIDE = { id: RIDE_ID, rider_id: RIDER.id, status: "completed", fare: 269 };

const insertedPayment = () => fake.ops("payments").find((o) => o.method === "insert")?.args[0];
const updatedPayment = () => fake.ops("payments").find((o) => o.method === "update")?.args[0];
const wasUpdated = () => fake.ops("payments").some((o) => o.method === "update");

describe("POST /api/payments/create-order", () => {
  const call = (body) => createOrder(jsonRequest(body));

  it("returns 401 when logged out", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await call({ ride_id: RIDE_ID })).status).toBe(401);
  });

  it("returns 403 for a driver", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    expect((await call({ ride_id: RIDE_ID })).status).toBe(403);
  });

  it("rejects an invalid ride id", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    expect((await call({ ride_id: "abc" })).status).toBe(400);
  });

  it("returns 404 for a ride that belongs to someone else", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: { ...COMPLETED_RIDE, rider_id: "someone-else" }, error: null });
    expect((await call({ ride_id: RIDE_ID })).status).toBe(404);
    expect(createRazorpayOrder).not.toHaveBeenCalled();
  });

  it("returns 404 for a ride that doesn't exist", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: null, error: null });
    expect((await call({ ride_id: RIDE_ID })).status).toBe(404);
  });

  it("returns 409 when the ride isn't completed yet", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: { ...COMPLETED_RIDE, status: "in_progress" }, error: null });
    expect((await call({ ride_id: RIDE_ID })).status).toBe(409);
    expect(createRazorpayOrder).not.toHaveBeenCalled();
  });

  it("returns 409 when the ride is already paid", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: COMPLETED_RIDE, error: null });
    fake.queue("payments", { data: [{ id: "p1" }], error: null });
    expect((await call({ ride_id: RIDE_ID })).status).toBe(409);
    expect(createRazorpayOrder).not.toHaveBeenCalled();
  });

  it("charges the fare from the database, ignoring any amount from the browser", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    createRazorpayOrder.mockResolvedValue({ id: ORDER, amount: 26900, currency: "INR" });
    fake.queue("rides", { data: COMPLETED_RIDE, error: null });
    fake.queue("payments", { data: [], error: null }); // not paid yet
    fake.queue("payments", { data: null, error: null }); // the insert

    const res = await call({ ride_id: RIDE_ID, amount: 1 }); // the browser tries a 1 rupee price
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.order_id).toBe(ORDER);
    expect(createRazorpayOrder).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 26900 }));
    expect(insertedPayment()).toMatchObject({
      ride_id: RIDE_ID,
      amount: 269,
      status: "pending",
      provider_order_id: ORDER,
      platform_fee: 53.8,
      driver_earning: 215.2,
    });
  });
});

describe("POST /api/payments/verify", () => {
  const PENDING = { id: "pay-row-1", status: "pending", ride_id: RIDE_ID, rides: { rider_id: RIDER.id, driver_id: DRIVER.id } };
  const good = {
    razorpay_order_id: ORDER,
    razorpay_payment_id: PAY,
    razorpay_signature: sign(`${ORDER}|${PAY}`, "test_secret"),
  };
  const call = (body) => verify(jsonRequest(body));

  it("returns 401 when logged out", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await call(good)).status).toBe(401);
  });

  it("returns 403 for a driver", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    expect((await call(good)).status).toBe(403);
  });

  it("rejects malformed details", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    expect((await call({ ...good, razorpay_order_id: "!!" })).status).toBe(400);
  });

  it("returns 404 for another rider's payment", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("payments", { data: { ...PENDING, rides: { rider_id: "someone-else", driver_id: DRIVER.id } }, error: null });
    expect((await call(good)).status).toBe(404);
  });

  it("rejects a made-up signature and leaves the payment pending", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("payments", { data: PENDING, error: null });
    const res = await call({ ...good, razorpay_signature: "0".repeat(64) });
    expect(res.status).toBe(400);
    expect(wasUpdated()).toBe(false);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("rejects a signature made with the wrong secret", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("payments", { data: PENDING, error: null });
    const forged = sign(`${ORDER}|${PAY}`, "not_the_secret");
    expect((await call({ ...good, razorpay_signature: forged })).status).toBe(400);
    expect(wasUpdated()).toBe(false);
  });

  it("marks a genuine payment as succeeded and pings the driver", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("payments", { data: PENDING, error: null });
    fake.queue("payments", { data: [{ id: "pay-row-1" }], error: null });

    const res = await call(good);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "succeeded" });
    expect(updatedPayment()).toMatchObject({ status: "succeeded", provider_payment_id: PAY });
    expect(notifyUser).toHaveBeenCalledWith(DRIVER.id, "paid");
        expect(emailReceiptAfterPayment).toHaveBeenCalledWith({ rideId: RIDE_ID, riderId: RIDER.id });
  });

  it("does nothing extra when the payment is already confirmed", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("payments", { data: { ...PENDING, status: "succeeded" }, error: null });

    const res = await call(good);

    expect(res.status).toBe(200);
    expect(wasUpdated()).toBe(false);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("returns 409 when the ride already has a successful payment", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("payments", { data: PENDING, error: null });
    fake.queue("payments", { data: null, error: { code: "23505", message: "duplicate" } });

    expect((await call(good)).status).toBe(409);
    expect(notifyUser).not.toHaveBeenCalled();
  });
});

describe("POST /api/payments/webhook", () => {
    const ROW = { id: "pay-row-1", status: "pending", amount: 269, currency: "inr", ride_id: RIDE_ID, rides: { driver_id: DRIVER.id, rider_id: RIDER.id } };

  const eventBody = (overrides = {}, eventName = "payment.captured") =>
    JSON.stringify({
      event: eventName,
      payload: { payment: { entity: { id: PAY, order_id: ORDER, amount: 26900, currency: "INR", ...overrides } } },
    });

  const send = (body, signature) =>
    webhook(
      new Request("http://localhost/api/payments/webhook", {
        method: "POST",
        headers: signature ? { "x-razorpay-signature": signature } : {},
        body,
      })
    );

  it("rejects a message with a wrong signature", async () => {
    const res = await send(eventBody(), "0".repeat(64));
    expect(res.status).toBe(400);
    expect(fake.calls).toHaveLength(0); // it never touched the database
  });

  it("rejects a message with no signature", async () => {
    expect((await send(eventBody(), null)).status).toBe(400);
  });

  it("rejects a message signed with a different secret", async () => {
    const body = eventBody();
    expect((await send(body, sign(body, "someone_elses_secret"))).status).toBe(400);
  });

  it("marks the payment succeeded and pings the driver", async () => {
    const body = eventBody();
    fake.queue("payments", { data: ROW, error: null });
    fake.queue("payments", { data: [{ id: "pay-row-1" }], error: null });

    const res = await send(body, sign(body, "webhook_secret"));

    expect(res.status).toBe(200);
    expect(updatedPayment()).toMatchObject({ status: "succeeded", provider_payment_id: PAY });
    expect(notifyUser).toHaveBeenCalledWith(DRIVER.id, "paid");
        expect(emailReceiptAfterPayment).toHaveBeenCalledWith({ rideId: RIDE_ID, riderId: RIDER.id });
  });

  it("ignores a payment whose amount doesn't match", async () => {
    const body = eventBody({ amount: 100 });
    fake.queue("payments", { data: ROW, error: null });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await send(body, sign(body, "webhook_secret"));

    expect(res.status).toBe(200);
    expect(wasUpdated()).toBe(false);
    errorLog.mockRestore();
  });

  it("acknowledges an order we don't know without changing anything", async () => {
    const body = eventBody();
    fake.queue("payments", { data: null, error: null });
    const res = await send(body, sign(body, "webhook_secret"));
    expect(res.status).toBe(200);
    expect(wasUpdated()).toBe(false);
  });

  it("does nothing for a payment that is already confirmed", async () => {
    const body = eventBody();
    fake.queue("payments", { data: { ...ROW, status: "succeeded" }, error: null });
    const res = await send(body, sign(body, "webhook_secret"));
    expect(res.status).toBe(200);
    expect(wasUpdated()).toBe(false);
    expect(notifyUser).not.toHaveBeenCalled();
    expect(emailReceiptAfterPayment).not.toHaveBeenCalled();
  });

  it("acknowledges other event types without touching the database", async () => {
    const body = eventBody({}, "payment.failed");
    const res = await send(body, sign(body, "webhook_secret"));
    expect(res.status).toBe(200);
    expect(fake.calls).toHaveLength(0);
  });

  it("answers 500 when the webhook secret isn't configured", async () => {
    const saved = process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const res = await send(eventBody(), "anything");
    process.env.RAZORPAY_WEBHOOK_SECRET = saved;
    expect(res.status).toBe(500);
  });
});

describe("GET /api/earnings", () => {
  it("returns 401 when logged out", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await earnings()).status).toBe(401);
  });

  it("returns 403 for a rider", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    expect((await earnings()).status).toBe(403);
  });

  it("adds up a driver's earnings, and only looks at their own rides", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    const now = new Date().toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    fake.queue("payments", {
      data: [
        { amount: "269.00", driver_earning: "215.20", created_at: now, updated_at: now,
          rides: { pickup_address: "A", dropoff_address: "B" } },
        { amount: "100.00", driver_earning: "80.00", created_at: tenDaysAgo, updated_at: tenDaysAgo,
          rides: { pickup_address: "C", dropoff_address: "D" } },
      ],
      error: null,
    });

    const res = await earnings();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary).toEqual({ total: 295.2, last_7_days: 215.2, rides: 2, average: 147.6 });
    expect(data.payments).toHaveLength(2);
    expect(fake.ops("payments")).toContainEqual({ method: "eq", args: ["rides.driver_id", DRIVER.id] });
    expect(fake.ops("payments")).toContainEqual({ method: "eq", args: ["status", "succeeded"] });
  });
});
import { describe, it, expect, vi } from "vitest";
import { POST as createOrder } from "@/app/api/payments/create-order/route.js";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { createRazorpayOrder } from "@/lib/payments";
import { fake, jsonRequest, RIDER } from "./helpers/fake.js";

// Keep the real money helpers, but never call the real Razorpay
vi.mock("@/lib/payments", async (importOriginal) => ({
  ...(await importOriginal()),
  createRazorpayOrder: vi.fn(),
}));

const RIDE_ID = "3f2a9c1e-5b7d-4e8f-9a6b-1c2d3e4f5a6b";
const RIDE = { id: RIDE_ID, rider_id: RIDER.id, status: "completed", fare: 269 };

const call = () => createOrder(jsonRequest({ ride_id: RIDE_ID }));
const insertedPayment = () => fake.ops("payments").find((o) => o.method === "insert");

describe("starting a payment more than once", () => {
  it("reuses an unpaid order instead of creating another one", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: RIDE, error: null });
    fake.queue("payments", { data: [], error: null }); // not paid
    fake.queue("payments", { data: [{ provider_order_id: "order_OLD", amount: "269.00" }], error: null });

    const res = await call();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({ order_id: "order_OLD", amount: 26900, currency: "INR" });
    expect(createRazorpayOrder).not.toHaveBeenCalled();
    expect(insertedPayment()).toBeUndefined(); // no new payment row either
  });

  it("looks for the newest unpaid order of this ride", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: RIDE, error: null });
    fake.queue("payments", { data: [], error: null });
    fake.queue("payments", { data: [{ provider_order_id: "order_OLD", amount: 269 }], error: null });

    await call();

    const ops = fake.ops("payments");
    expect(ops).toContainEqual({ method: "eq", args: ["ride_id", RIDE_ID] });
    expect(ops).toContainEqual({ method: "eq", args: ["status", "pending"] });
    expect(ops).toContainEqual({ method: "limit", args: [1] });
  });

  it("does not reuse an order made for a different amount", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    createRazorpayOrder.mockResolvedValue({ id: "order_NEW", amount: 26900, currency: "INR" });
    fake.queue("rides", { data: RIDE, error: null });
    fake.queue("payments", { data: [], error: null });
    fake.queue("payments", { data: [{ provider_order_id: "order_OLD", amount: "100.00" }], error: null });
    fake.queue("payments", { data: null, error: null }); // the insert

    const res = await call();

    expect((await res.json()).order_id).toBe("order_NEW");
    expect(createRazorpayOrder).toHaveBeenCalledTimes(1);
    expect(insertedPayment().args[0]).toMatchObject({ provider_order_id: "order_NEW", amount: 269 });
  });

  it("creates a first order when there is nothing to reuse", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    createRazorpayOrder.mockResolvedValue({ id: "order_FIRST", amount: 26900, currency: "INR" });
    fake.queue("rides", { data: RIDE, error: null });
    fake.queue("payments", { data: [], error: null });
    fake.queue("payments", { data: [], error: null });
    fake.queue("payments", { data: null, error: null });

    const res = await call();

    expect((await res.json()).order_id).toBe("order_FIRST");
    expect(createRazorpayOrder).toHaveBeenCalledTimes(1);
  });
});
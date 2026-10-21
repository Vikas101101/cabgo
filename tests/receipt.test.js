import { describe, it, expect } from "vitest";
import { buildReceipt } from "@/lib/receipt";
import { GET } from "@/app/api/receipts/[id]/route.js";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { fake, ctx, RIDER, DRIVER } from "./helpers/fake.js";

const ID = "3f2a9c1e-5b7d-4e8f-9a6b-1c2d3e4f5a6b";

const RIDE = {
  id: ID,
  rider_id: RIDER.id,
  driver_id: DRIVER.id,
  pickup_address: "Shivajinagar, Pune",
  dropoff_address: "Hinjewadi, Pune",
  distance_km: "14.20",
  duration_min: "30.5",
  fare: "269.00",
  ride_type: "car",
  created_at: "2026-10-20T08:00:00Z",
  updated_at: "2026-10-20T08:40:00Z",
};

const PAYMENT = {
  id: "a1b2c3d4-0000-4000-8000-000000000000",
  amount: "269.00",
  currency: "inr",
  provider_payment_id: "pay_XYZ789",
  created_at: "2026-10-20T08:41:00Z",
  updated_at: "2026-10-20T08:42:00Z",
};

const DRIVER_INFO = { name: "Dev", vehicle_model: "Maruti Swift", vehicle_number: "MH12 AB 1234" };

describe("buildReceipt", () => {
  const rider = { id: "rider-1", name: "Asha Rider", email: "asha@example.com" };

  it("makes a receipt number from the payment id", () => {
    const r = buildReceipt({ ride: RIDE, payment: PAYMENT, rider, driver: DRIVER_INFO });
    expect(r.receipt_number).toBe("CG-A1B2C3D4");
  });

  it("turns text numbers into real numbers and upper-cases the currency", () => {
    const r = buildReceipt({ ride: RIDE, payment: PAYMENT, rider, driver: DRIVER_INFO });
    expect(r).toMatchObject({ amount: 269, currency: "INR", distance_km: 14.2, duration_min: 30.5 });
  });

  it("uses the payment date, and falls back to its creation date", () => {
    const a = buildReceipt({ ride: RIDE, payment: PAYMENT, rider, driver: null });
    expect(a.paid_at).toBe(PAYMENT.updated_at);
    const b = buildReceipt({ ride: RIDE, payment: { ...PAYMENT, updated_at: null }, rider, driver: null });
    expect(b.paid_at).toBe(PAYMENT.created_at);
  });

  it("works without a driver", () => {
    const r = buildReceipt({ ride: RIDE, payment: PAYMENT, rider, driver: null });
    expect(r.driver).toBeNull();
  });

  it("never includes internal ids, the commission or the driver's share", () => {
    const payment = { ...PAYMENT, platform_fee: 53.8, driver_earning: 215.2 };
    const r = buildReceipt({ ride: RIDE, payment, rider, driver: DRIVER_INFO });
    for (const secret of ["rider_id", "driver_id", "platform_fee", "driver_earning"]) {
      expect(r).not.toHaveProperty(secret);
    }
    expect(JSON.stringify(r)).not.toContain("53.8");
  });
});

describe("GET /api/receipts/[id]", () => {
  const call = (id = ID) => GET(new Request("http://localhost/api/receipts/x"), ctx(id));

  it("returns 401 when logged out", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it("returns 403 for a driver, without touching the database", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    expect((await call()).status).toBe(403);
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects an id that isn't a real ride id", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    expect((await call("abc")).status).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });

  it("returns 404 for a ride that doesn't exist", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: null, error: null });
    expect((await call()).status).toBe(404);
  });

  it("returns 404 for someone else's ride, and never looks at its payment", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: { ...RIDE, rider_id: "someone-else" }, error: null });
    expect((await call()).status).toBe(404);
    expect(fake.calls.some((c) => c.table === "payments")).toBe(false);
  });

  it("returns 409 when the ride hasn't been paid", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: RIDE, error: null });
    fake.queue("payments", { data: null, error: null });
    expect((await call()).status).toBe(409);
  });

  it("returns the receipt with the driver's first name and vehicle", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: RIDE, error: null });
    fake.queue("payments", { data: PAYMENT, error: null });
    fake.queue("users", { data: { name: "Dev Driver" }, error: null });
    fake.queue("drivers", { data: { vehicle_model: "Maruti Swift", vehicle_number: "MH12 AB 1234" }, error: null });

    const res = await call();
    const { receipt } = await res.json();

    expect(res.status).toBe(200);
    expect(receipt.receipt_number).toBe("CG-A1B2C3D4");
    expect(receipt.driver).toEqual(DRIVER_INFO); // "Dev", not "Dev Driver"
    expect(receipt.amount).toBe(269);
    expect(fake.ops("payments")).toContainEqual({ method: "eq", args: ["status", "succeeded"] });
  });

  it("returns a receipt for a ride that had no driver details", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: { ...RIDE, driver_id: null }, error: null });
    fake.queue("payments", { data: PAYMENT, error: null });

    const { receipt } = await (await call()).json();
    expect(receipt.driver).toBeNull();
  });
});
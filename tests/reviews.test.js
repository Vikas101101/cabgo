import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/reviews/route.js";
import { GET as pending } from "@/app/api/reviews/pending/route.js";
import { GET as driverReviews } from "@/app/api/reviews/driver/route.js";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { notifyUser } from "@/lib/realtime";
import { fake, jsonRequest, RIDER, DRIVER } from "./helpers/fake.js";

const RIDE_ID = "3f2a9c1e-5b7d-4e8f-9a6b-1c2d3e4f5a6b";
const COMPLETED = { id: RIDE_ID, rider_id: RIDER.id, driver_id: DRIVER.id, status: "completed" };

const post = (body) => POST(jsonRequest(body));
const insertedReview = () => fake.ops("reviews").find((o) => o.method === "insert")?.args[0];

describe("POST /api/reviews", () => {
  it("returns 401 when logged out", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await post({ ride_id: RIDE_ID, rating: 5 })).status).toBe(401);
  });

  it("returns 403 for a driver", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    expect((await post({ ride_id: RIDE_ID, rating: 5 })).status).toBe(403);
    expect(fake.calls).toHaveLength(0);
  });

  it("returns 400 for a body that isn't JSON", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    const res = await POST(new Request("http://localhost/api/reviews", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid ride id without touching the database", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    expect((await post({ ride_id: "abc", rating: 5 })).status).toBe(400);
    expect((await post({ rating: 5 })).status).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects a bad rating or comment without touching the database", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    expect((await post({ ride_id: RIDE_ID, rating: 6 })).status).toBe(400);
    expect((await post({ ride_id: RIDE_ID, rating: "5" })).status).toBe(400);
    expect((await post({ ride_id: RIDE_ID, rating: 5, comment: "x".repeat(501) })).status).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });

  it("returns 404 for a ride that doesn't exist", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: null, error: null });
    expect((await post({ ride_id: RIDE_ID, rating: 5 })).status).toBe(404);
  });

  it("returns 404 for someone else's ride", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: { ...COMPLETED, rider_id: "someone-else" }, error: null });
    expect((await post({ ride_id: RIDE_ID, rating: 5 })).status).toBe(404);
    expect(fake.calls.some((c) => c.table === "reviews")).toBe(false);
  });

  it("returns 409 when the ride isn't completed", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    for (const status of ["requested", "accepted", "in_progress", "cancelled"]) {
      fake.reset();
      fake.queue("rides", { data: { ...COMPLETED, status }, error: null });
      expect((await post({ ride_id: RIDE_ID, rating: 5 })).status).toBe(409);
    }
    expect(fake.calls.some((c) => c.table === "reviews")).toBe(false);
  });

  it("returns 409 when the ride has no driver", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: { ...COMPLETED, driver_id: null }, error: null });
    expect((await post({ ride_id: RIDE_ID, rating: 5 })).status).toBe(409);
  });

  it("saves the review with the ids taken from the ride, not from the browser", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: COMPLETED, error: null });
    fake.queue("reviews", {
      data: { id: "rev-1", rating: 4, comment: "Great ride", created_at: "2026-10-21T10:00:00Z" },
      error: null,
    });

    // The browser tries to name a different driver and rider
    const res = await post({
      ride_id: RIDE_ID,
      rating: 4,
      comment: "  Great ride  ",
      driver_id: "someone-else",
      rider_id: "another-rider",
    });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.review).toMatchObject({ rating: 4, comment: "Great ride" });
    expect(insertedReview()).toEqual({
      ride_id: RIDE_ID,
      rider_id: RIDER.id,
      driver_id: DRIVER.id,
      rating: 4,
      comment: "Great ride",
    });
    expect(notifyUser).toHaveBeenCalledWith(DRIVER.id, "reviewed");
  });

  it("returns 409 when the ride has already been rated, and sends no ping", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: COMPLETED, error: null });
    fake.queue("reviews", { data: null, error: { code: "23505", message: "duplicate key" } });

    const res = await post({ ride_id: RIDE_ID, rating: 5 });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already rated/);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("returns 500 on any other database error", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: COMPLETED, error: null });
    fake.queue("reviews", { data: null, error: { code: "XX000", message: "database down" } });
    expect((await post({ ride_id: RIDE_ID, rating: 5 })).status).toBe(500);
    expect(notifyUser).not.toHaveBeenCalled();
  });
});

describe("GET /api/reviews/pending", () => {
  const ride = (id, driver = DRIVER.id) => ({
    id,
    pickup_address: "A",
    dropoff_address: "B",
    driver_id: driver,
    updated_at: "2026-10-20T10:00:00Z",
  });

  it("returns 401 when logged out", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await pending()).status).toBe(401);
  });

  it("returns an empty list for a driver, without touching the database", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    const data = await (await pending()).json();
    expect(data).toEqual({ rides: [] });
    expect(fake.calls).toHaveLength(0);
  });

  it("only looks at this rider's completed rides from the last 30 days", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [], error: null });
    await pending();
    const ops = fake.ops("rides");
    expect(ops).toContainEqual({ method: "eq", args: ["rider_id", RIDER.id] });
    expect(ops).toContainEqual({ method: "eq", args: ["status", "completed"] });
    expect(ops.some((o) => o.method === "gte" && o.args[0] === "updated_at")).toBe(true);
  });

  it("does not look up reviews when there are no rides", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [], error: null });
    expect(await (await pending()).json()).toEqual({ rides: [] });
    expect(fake.calls.some((c) => c.table === "reviews")).toBe(false);
  });

  it("leaves out rides that were already rated, and shows the driver's first name", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [ride("r1"), ride("r2"), ride("r3")], error: null });
    fake.queue("reviews", { data: [{ ride_id: "r2" }], error: null });
    fake.queue("users", { data: [{ id: DRIVER.id, name: "Dev Driver" }], error: null });

    const data = await (await pending()).json();

    expect(data.rides.map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(data.rides[0].driver_name).toBe("Dev");
  });

  it("never sends the driver's id", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [ride("r1")], error: null });
    fake.queue("reviews", { data: [], error: null });
    fake.queue("users", { data: [{ id: DRIVER.id, name: "Dev Driver" }], error: null });

    const text = JSON.stringify(await (await pending()).json());

    expect(text).not.toContain(DRIVER.id);
    expect(text).not.toContain("driver_id");
  });

  it("shows at most 5 rides", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: Array.from({ length: 8 }, (_, i) => ride(`r${i}`)), error: null });
    fake.queue("reviews", { data: [], error: null });
    fake.queue("users", { data: [{ id: DRIVER.id, name: "Dev" }], error: null });

    expect((await (await pending()).json()).rides).toHaveLength(5);
  });

  it("does not look up drivers when everything is already rated", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [ride("r1")], error: null });
    fake.queue("reviews", { data: [{ ride_id: "r1" }], error: null });

    expect(await (await pending()).json()).toEqual({ rides: [] });
    expect(fake.calls.some((c) => c.table === "users")).toBe(false);
  });
});

describe("GET /api/reviews/driver", () => {
  it("returns 401 when logged out", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await driverReviews()).status).toBe(401);
  });

  it("returns 403 for a rider", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    expect((await driverReviews()).status).toBe(403);
    expect(fake.calls).toHaveLength(0);
  });

  it("gives the average, the count and the latest reviews", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", { data: { rating_sum: 14, rating_count: 3 }, error: null });
    fake.queue("reviews", {
      data: [{ rating: 5, comment: "Great", created_at: "2026-10-21T10:00:00Z" }],
      error: null,
    });

    const data = await (await driverReviews()).json();

    expect(data.summary).toEqual({ average: 4.7, count: 3 });
    expect(data.reviews).toHaveLength(1);
  });

  it("only reads this driver's reviews, and never selects who wrote them", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", { data: { rating_sum: 5, rating_count: 1 }, error: null });
    fake.queue("reviews", { data: [], error: null });

    await driverReviews();

    expect(fake.ops("reviews")).toContainEqual({ method: "eq", args: ["driver_id", DRIVER.id] });
    const columns = fake.ops("reviews").find((o) => o.method === "select").args[0];
    expect(columns).not.toContain("rider_id");
  });

  it("shows no average for a driver with no ratings yet", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", { data: { rating_sum: 0, rating_count: 0 }, error: null });
    fake.queue("reviews", { data: [], error: null });

    const data = await (await driverReviews()).json();

    expect(data.summary).toEqual({ average: null, count: 0 });
    expect(data.reviews).toEqual([]);
  });

  it("copes with a missing driver row", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", { data: null, error: null });
    fake.queue("reviews", { data: [], error: null });

    expect((await (await driverReviews()).json()).summary).toEqual({ average: null, count: 0 });
  });
});
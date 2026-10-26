import { describe, it, expect, vi } from "vitest";
import { GET, POST } from "@/app/api/rides/route.js";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { getRoute } from "@/lib/route";
import { notifyUser } from "@/lib/realtime";
import { calculateFare } from "@/lib/fare";
import { fake, jsonRequest, RIDER, DRIVER } from "./helpers/fake.js";

// A normal booking request, like the one the Book a ride page sends
const BODY = {
  pickup: { address: "Shivajinagar, Pune", lat: 18.5308, lng: 73.8475 },
  dropoff: { address: "Hinjewadi, Pune", lat: 18.5912, lng: 73.7389 },
  ride_type: "car",
};

// The row our route tried to save, taken from the recorded database steps
const insertedRow = () =>
  fake.ops("rides").find((o) => o.method === "insert")?.args[0];

describe("GET /api/rides", () => {
  // The route asks for the list first, then the three counts (all, active, completed)
  const queueResults = ({ list = [], total = 0, active = 0, completed = 0 } = {}) => {
    fake.queue("rides", { data: list, error: null });
    fake.queue("rides", { count: total, error: null });
    fake.queue("rides", { count: active, error: null });
    fake.queue("rides", { count: completed, error: null });
  };

  it("returns 401 when nobody is logged in", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("gives a rider the newest rides and the counts", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    queueResults({ list: [{ id: "r1", status: "completed" }], total: 7, active: 2, completed: 4 });

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.rides).toHaveLength(1);
    expect(data.counts).toEqual({ total: 7, active: 2, completed: 4 });
  });

  it("only looks at this rider's own rides", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    queueResults();
    await GET();
    const filters = fake.ops("rides").filter((o) => o.method === "eq");
    expect(filters.length).toBeGreaterThanOrEqual(4); // the list and each count
    expect(filters.every((o) => o.args[0] === "rider_id" && o.args[1] === RIDER.id)).toBe(true);
  });

  it("only looks at rides a driver drove, not every open request", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    queueResults();
    await GET();
    const ops = fake.ops("rides");
    expect(ops).toContainEqual({ method: "eq", args: ["driver_id", DRIVER.id] });
    expect(ops.some((o) => o.method === "or")).toBe(false);
  });

  it("asks for only five rides, and never for the ids of the people", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    queueResults();
    await GET();
    const ops = fake.ops("rides");
    expect(ops).toContainEqual({ method: "limit", args: [5] });
    const columns = ops.find((o) => o.method === "select" && String(o.args[0]).includes("pickup_address")).args[0];
    expect(columns).not.toContain("rider_id");
    expect(columns).not.toContain("driver_id");
    expect(columns).not.toContain("*");
  });

  it("counts in the database, without downloading the rides", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    queueResults();
    await GET();
    const counts = fake.ops("rides").filter(
      (o) => o.method === "select" && o.args[1]?.head === true && o.args[1]?.count === "exact"
    );
    expect(counts).toHaveLength(3);
  });

  it("counts active rides as requested, accepted and in progress", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    queueResults();
    await GET();
    const ops = fake.ops("rides");
    expect(ops).toContainEqual({ method: "in", args: ["status", ["requested", "accepted", "in_progress"]] });
    expect(ops).toContainEqual({ method: "in", args: ["status", ["completed"]] });
  });

  it("shows zeros for a person with no rides", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: null, error: null });
    fake.queue("rides", { count: null, error: null });
    fake.queue("rides", { count: null, error: null });
    fake.queue("rides", { count: null, error: null });

    const data = await (await GET()).json();

    expect(data.rides).toEqual([]);
    expect(data.counts).toEqual({ total: 0, active: 0, completed: 0 });
  });

  it("hides the details of a database error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: null, error: { code: "XX000", message: "table is on fire" } });
    fake.queue("rides", { count: 0, error: null });
    fake.queue("rides", { count: 0, error: null });
    fake.queue("rides", { count: 0, error: null });

    const res = await GET();

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("on fire");
    log.mockRestore();
  });
});

describe("POST /api/rides (booking a ride)", () => {
  // The route first cancels this rider's expired requests, so every booking that gets
  // that far uses one extra answer on "rides" before the active-ride check.
  const queueSweep = () => fake.queue("rides", { data: null, error: null });

  it("returns 401 when nobody is logged in", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await POST(jsonRequest(BODY));
    expect(res.status).toBe(401);
  });

  it("returns 403 when a driver tries to book", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    const res = await POST(jsonRequest(BODY));
    expect(res.status).toBe(403);
  });

  it("rejects an unknown ride type", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    const res = await POST(jsonRequest({ ...BODY, ride_type: "helicopter" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Choose a ride type");
  });

  it("rejects a pickup with impossible coordinates", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    const res = await POST(
      jsonRequest({ ...BODY, pickup: { address: "Nowhere", lat: 200, lng: 0 } })
    );
    expect(res.status).toBe(400);
  });

  it("cancels the rider's own expired requests before checking for an active ride", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    queueSweep();
    fake.queue("rides", { data: [{ id: "old-ride" }], error: null });

    await POST(jsonRequest(BODY));

    const ops = fake.ops("rides");
    expect(ops.find((o) => o.method === "update").args[0]).toMatchObject({ status: "cancelled" });
    expect(ops).toContainEqual({ method: "eq", args: ["rider_id", RIDER.id] });
    expect(ops).toContainEqual({ method: "eq", args: ["status", "requested"] });
    expect(ops.some((o) => o.method === "lt" && o.args[0] === "created_at")).toBe(true);
  });

  it("returns 409 when the rider already has an active ride", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    queueSweep();
    fake.queue("rides", { data: [{ id: "old-ride" }], error: null });

    const res = await POST(jsonRequest(BODY));

    expect(res.status).toBe(409);
    expect(getRoute).not.toHaveBeenCalled(); // it stopped before doing any work
  });

  it("returns 409 when a second booking sent at the same instant hits the database rule", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    getRoute.mockResolvedValue({ distanceKm: 10, durationMin: 20, path: [] });
    queueSweep();
    fake.queue("rides", { data: [], error: null }); // the check passed...
    fake.queue("rides", { data: null, error: { code: "23505", message: "duplicate key" } }); // ...but the insert lost

    const res = await POST(jsonRequest(BODY));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already have an active ride/);
    expect(fake.calls.some((c) => c.table === "drivers")).toBe(false); // nobody was pinged
  });

  it("saves the ride with a fare worked out by the server, ignoring the browser's price", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    getRoute.mockResolvedValue({ distanceKm: 10, durationMin: 20, path: [] });
    queueSweep();
    fake.queue("rides", { data: [], error: null }); // no active ride
    fake.queue("rides", { data: { id: "ride-1", status: "requested" }, error: null }); // the insert
    fake.queue("drivers", { data: [], error: null }); // no drivers to ping

    // The browser tries to sneak in its own price of 1 rupee
    const res = await POST(jsonRequest({ ...BODY, fare: 1 }));

    expect(res.status).toBe(201);
    expect(insertedRow()).toMatchObject({
      rider_id: RIDER.id, // taken from the login, not from the browser
      ride_type: "car",
      fare: calculateFare("car", 10, 20),
    });
    expect(insertedRow().fare).not.toBe(1);
  });

  it("pings only online drivers who were seen recently and are within the pickup radius", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    getRoute.mockResolvedValue({ distanceKm: 10, durationMin: 20, path: [] });
    queueSweep();
    fake.queue("rides", { data: [], error: null });
    fake.queue("rides", { data: { id: "ride-1" }, error: null });
    fake.queue("drivers", {
      data: [
        { user_id: "d-near", current_lat: 18.531, current_lng: 73.848 }, // a few metres away
        { user_id: "d-far", current_lat: 18.5912, current_lng: 73.7389 }, // across the city
      ],
      error: null,
    });

    const res = await POST(jsonRequest(BODY));

    expect(res.status).toBe(201);
    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(notifyUser).toHaveBeenCalledWith("d-near", "new-request");
    expect(fake.ops("drivers")).toContainEqual({ method: "eq", args: ["is_online", true] });
    expect(fake.ops("drivers").some((o) => o.method === "gte" && o.args[0] === "last_seen_at")).toBe(true);
  });

  it("still books the ride even if the realtime ping fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {}); // hide the expected warning
    getCurrentUser.mockResolvedValue(RIDER);
    getRoute.mockResolvedValue({ distanceKm: 10, durationMin: 20, path: [] });
    notifyUser.mockRejectedValue(new Error("realtime is down"));
    queueSweep();
    fake.queue("rides", { data: [], error: null });
    fake.queue("rides", { data: { id: "ride-1" }, error: null });
    fake.queue("drivers", {
      data: [{ user_id: "d-near", current_lat: 18.531, current_lng: 73.848 }],
      error: null,
    });

    const res = await POST(jsonRequest(BODY));

    expect(res.status).toBe(201);
    warn.mockRestore();
  });
});
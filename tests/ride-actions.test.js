import { checkRateLimit } from "@/lib/rateLimit";
import { notifyNearbyDrivers } from "@/lib/matching";
import { describe, it, expect, vi } from "vitest";
import { PATCH } from "@/app/api/rides/[id]/route.js";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { notifyUser } from "@/lib/realtime";
import { fake, jsonRequest, ctx, RIDER, DRIVER } from "./helpers/fake.js";
// The "ping nearby drivers" step has its own tests, so here we only check that it is called
vi.mock("@/lib/matching", () => ({ notifyNearbyDrivers: vi.fn() }));

const ID = "3f2a9c1e-5b7d-4e8f-9a6b-1c2d3e4f5a6b"; // a valid-looking ride id

// Sends { action } to the route, like the buttons on the pages do
const patch = (action, id = ID) => PATCH(jsonRequest({ action }, "PATCH"), ctx(id));

// A driver who is online, standing at the pickup point
const DRIVER_AT_PICKUP = { is_online: true, current_lat: 18.5308, current_lng: 73.8475 };
const OPEN_RIDE = {
  id: ID,
  status: "requested",
  pickup_lat: 18.5308,
  pickup_lng: 73.8475,
  created_at: new Date().toISOString(),
};

describe("PATCH /api/rides/[id] basics", () => {
  it("rejects an id that isn't a real ride id", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    const res = await patch("accept", "abc");
    expect(res.status).toBe(400);
  });

  it("rejects an unknown action", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    const res = await patch("teleport");
    expect(res.status).toBe(400);
  });
});

describe("accepting a ride", () => {
  it("lets a nearby online driver accept, and pings the rider", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", { data: DRIVER_AT_PICKUP, error: null });
    fake.queue("rides", { data: [], error: null }); // driver has no current ride
    fake.queue("rides", { data: OPEN_RIDE, error: null }); // the ride is still open
    fake.queue("rides", {
      data: [{ id: ID, status: "accepted", driver_id: DRIVER.id, rider_id: RIDER.id }],
      error: null,
    });

    const res = await patch("accept");
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ride.status).toBe("accepted");
    expect(data.ride).not.toHaveProperty("rider_id"); // the rider's id is never sent back
    expect(notifyUser).toHaveBeenCalledWith(RIDER.id, "accepted");
  });

  it("returns 403 when a rider tries to accept", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    const res = await patch("accept");
    expect(res.status).toBe(403);
  });

  it("returns 400 when the driver is offline", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", {
      data: { is_online: false, current_lat: null, current_lng: null },
      error: null,
    });
    const res = await patch("accept");
    expect(res.status).toBe(400);
  });

  it("returns 409 when the driver is already on another ride", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", { data: DRIVER_AT_PICKUP, error: null });
    fake.queue("rides", { data: [{ id: "other-ride" }], error: null });
    const res = await patch("accept");
    expect(res.status).toBe(409);
  });

  it("returns 403 when the pickup is too far from the driver", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", {
      data: { is_online: true, current_lat: 18.5912, current_lng: 73.7389 }, // Hinjewadi
      error: null,
    });
    fake.queue("rides", { data: [], error: null });
    fake.queue("rides", { data: OPEN_RIDE, error: null }); // pickup is in Shivajinagar

    const res = await patch("accept");

    expect(res.status).toBe(403);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("returns 409 when another driver already took the ride", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", { data: DRIVER_AT_PICKUP, error: null });
    fake.queue("rides", { data: [], error: null });
    fake.queue("rides", { data: { ...OPEN_RIDE, status: "accepted" }, error: null });
    const res = await patch("accept");
    expect(res.status).toBe(409);
  });

  it("returns 409 when another driver wins at the very same moment", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", { data: DRIVER_AT_PICKUP, error: null });
    fake.queue("rides", { data: [], error: null });
    fake.queue("rides", { data: OPEN_RIDE, error: null });
    fake.queue("rides", { data: [], error: null }); // the final update matched no rows

    const res = await patch("accept");

    expect(res.status).toBe(409);
    expect(notifyUser).not.toHaveBeenCalled();
  });
});

describe("starting and completing a ride", () => {
  it("starts the driver's own accepted ride and pings the rider", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("rides", {
      data: [{ id: ID, status: "in_progress", rider_id: RIDER.id }],
      error: null,
    });

    const res = await patch("start");
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ride).toEqual({ id: ID, status: "in_progress" });
    // The change is limited to THIS driver's ride, and only from the "accepted" stage
    const ops = fake.ops("rides");
    expect(ops).toContainEqual({ method: "eq", args: ["driver_id", DRIVER.id] });
    expect(ops).toContainEqual({ method: "eq", args: ["status", "accepted"] });
    expect(notifyUser).toHaveBeenCalledWith(RIDER.id, "started");
  });

  it("returns 403 when a rider tries to start a ride", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    const res = await patch("start");
    expect(res.status).toBe(403);
  });

  it("returns 409 when the ride isn't in the right stage, and sends no ping", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("rides", { data: [], error: null }); // nothing matched
    const res = await patch("start");
    expect(res.status).toBe(409);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("completes a ride that is in progress and pings the rider", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("rides", {
      data: [{ id: ID, status: "completed", rider_id: RIDER.id }],
      error: null,
    });

    const res = await patch("complete");

    expect(res.status).toBe(200);
    expect(fake.ops("rides")).toContainEqual({ method: "eq", args: ["status", "in_progress"] });
    expect(notifyUser).toHaveBeenCalledWith(RIDER.id, "completed");
  });
});

describe("cancelling a ride", () => {
  it("lets the rider cancel, and pings the driver who had accepted", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", {
      data: [{ id: ID, status: "cancelled", driver_id: DRIVER.id }],
      error: null,
    });

    const res = await patch("cancel");

    expect(res.status).toBe(200);
    expect(notifyUser).toHaveBeenCalledWith(DRIVER.id, "cancelled");
  });

  it("sends no ping when no driver had accepted yet", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", {
      data: [{ id: ID, status: "cancelled", driver_id: null }],
      error: null,
    });

    const res = await patch("cancel");

    expect(res.status).toBe(200);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("returns 403 when a driver tries to cancel", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    const res = await patch("cancel");
    expect(res.status).toBe(403);
  });

  it("returns 409 when the ride can't be cancelled (already started, or not theirs)", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [], error: null });
    const res = await patch("cancel");
    expect(res.status).toBe(409);
  });
});

describe("accepting a ride: expiry and the database rule", () => {
  const readyDriver = () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", { data: DRIVER_AT_PICKUP, error: null });
    fake.queue("rides", { data: [], error: null }); // the driver has no current ride
  };

  it("refuses a request that has expired", async () => {
    readyDriver();
    const old = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    fake.queue("rides", { data: { ...OPEN_RIDE, created_at: old }, error: null });

    const res = await patch("accept");

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/expired/);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("only assigns the driver if the request is still open and still fresh", async () => {
    readyDriver();
    fake.queue("rides", { data: OPEN_RIDE, error: null });
    fake.queue("rides", {
      data: [{ id: ID, status: "accepted", driver_id: DRIVER.id, rider_id: RIDER.id }],
      error: null,
    });

    await patch("accept");

    const ops = fake.ops("rides");
    expect(ops).toContainEqual({ method: "eq", args: ["status", "requested"] });
    expect(ops.some((o) => o.method === "gte" && o.args[0] === "created_at")).toBe(true);
  });

  it("returns 409 when the database stops a driver from taking two rides at once", async () => {
    readyDriver();
    fake.queue("rides", { data: OPEN_RIDE, error: null });
    fake.queue("rides", { data: null, error: { code: "23505", message: "duplicate key" } });

    const res = await patch("accept");

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/current ride/);
    expect(notifyUser).not.toHaveBeenCalled();
  });
});

describe("giving a ride back", () => {
  it("returns the ride to the pool, tells the rider, and tells other nearby drivers", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("rides", {
      data: [{ id: ID, rider_id: RIDER.id, pickup_lat: 18.5308, pickup_lng: 73.8475 }],
      error: null,
    });

    const res = await patch("release");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ride: { id: ID, status: "requested" } });
    expect(fake.ops("rides").find((o) => o.method === "update").args[0]).toMatchObject({
      status: "requested",
      driver_id: null,
    });
    expect(notifyUser).toHaveBeenCalledWith(RIDER.id, "released");
    expect(notifyNearbyDrivers).toHaveBeenCalledWith(
      { lat: 18.5308, lng: 73.8475 },
      { exceptUserId: DRIVER.id }
    );
  });

  it("only works on the driver's own ride, and only before it has started", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("rides", { data: [{ id: ID, rider_id: RIDER.id, pickup_lat: 1, pickup_lng: 1 }], error: null });
    await patch("release");

    const ops = fake.ops("rides");
    expect(ops).toContainEqual({ method: "eq", args: ["driver_id", DRIVER.id] });
    expect(ops).toContainEqual({ method: "eq", args: ["status", "accepted"] });
  });

  it("returns 409 when the ride isn't theirs or has already started, and tells nobody", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("rides", { data: [], error: null });

    const res = await patch("release");

    expect(res.status).toBe(409);
    expect(notifyUser).not.toHaveBeenCalled();
    expect(notifyNearbyDrivers).not.toHaveBeenCalled();
  });

  it("returns 403 for a rider, without counting against any limit", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    expect((await patch("release")).status).toBe(403);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("stops at the rate limit", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    checkRateLimit.mockResolvedValue(Response.json({ error: "Too many requests" }, { status: 429 }));

    const res = await patch("release");

    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(`release:${DRIVER.id}`, 6, 600);
    expect(fake.calls).toHaveLength(0);
  });
});
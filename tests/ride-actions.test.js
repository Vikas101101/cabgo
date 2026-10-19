import { describe, it, expect } from "vitest";
import { PATCH } from "@/app/api/rides/[id]/route.js";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { notifyUser } from "@/lib/realtime";
import { fake, jsonRequest, ctx, RIDER, DRIVER } from "./helpers/fake.js";

const ID = "3f2a9c1e-5b7d-4e8f-9a6b-1c2d3e4f5a6b"; // a valid-looking ride id

// Sends { action } to the route, like the buttons on the pages do
const patch = (action, id = ID) => PATCH(jsonRequest({ action }, "PATCH"), ctx(id));

// A driver who is online, standing at the pickup point
const DRIVER_AT_PICKUP = { is_online: true, current_lat: 18.5308, current_lng: 73.8475 };
const OPEN_RIDE = { id: ID, status: "requested", pickup_lat: 18.5308, pickup_lng: 73.8475 };

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
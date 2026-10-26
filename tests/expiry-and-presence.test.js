import { describe, it, expect, vi } from "vitest";
import { GET as available } from "@/app/api/rides/available/route.js";
import { GET as active } from "@/app/api/rides/active/route.js";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { notifyUser } from "@/lib/realtime";
import { notifyNearbyDrivers } from "@/lib/matching";
import {
  requestCutoff,
  driverFreshCutoff,
  REQUEST_TTL_MINUTES,
  DRIVER_FRESH_MINUTES,
} from "@/lib/rideRules";
import { fake, RIDER, DRIVER } from "./helpers/fake.js";

const MINUTE = 60 * 1000;
const ago = (minutes) => new Date(Date.now() - minutes * MINUTE).toISOString();

describe("rideRules", () => {
  it("counts back from the moment it is given", () => {
    const now = Date.UTC(2026, 9, 20, 12, 0, 0);
    expect(requestCutoff(now)).toBe(new Date(now - REQUEST_TTL_MINUTES * MINUTE).toISOString());
    expect(driverFreshCutoff(now)).toBe(new Date(now - DRIVER_FRESH_MINUTES * MINUTE).toISOString());
  });

  it("gives a cutoff in the past when no moment is given", () => {
    expect(Date.parse(requestCutoff())).toBeLessThan(Date.now());
    expect(Date.parse(driverFreshCutoff())).toBeLessThan(Date.now());
  });
});

describe("notifyNearbyDrivers", () => {
  const PICKUP = { lat: 18.5308, lng: 73.8475 };
  const NEAR = { user_id: "near", current_lat: 18.531, current_lng: 73.848 };
  const FAR = { user_id: "far", current_lat: 18.5912, current_lng: 73.7389 };

  it("pings only online, recently seen drivers who are close", async () => {
    fake.queue("drivers", { data: [NEAR, FAR], error: null });

    await notifyNearbyDrivers(PICKUP);

    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(notifyUser).toHaveBeenCalledWith("near", "new-request");
    const ops = fake.ops("drivers");
    expect(ops).toContainEqual({ method: "eq", args: ["is_online", true] });
    expect(ops.some((o) => o.method === "gte" && o.args[0] === "last_seen_at")).toBe(true);
  });

  it("skips the driver who just gave the ride back", async () => {
    fake.queue("drivers", { data: [NEAR], error: null });
    await notifyNearbyDrivers(PICKUP, { exceptUserId: "near" });
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("never throws, even when the database fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fake.queue("drivers", { data: null, error: { message: "database down" } });

    await expect(notifyNearbyDrivers(PICKUP)).resolves.toBeUndefined();

    expect(notifyUser).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("GET /api/rides/available", () => {
  const AT_PICKUP = { current_lat: 18.5308, current_lng: 73.8475 };
  const request = (id, lat, lng) => ({
    id,
    pickup_address: "A",
    pickup_lat: lat,
    pickup_lng: lng,
    dropoff_address: "B",
    distance_km: 10,
    duration_min: 20,
    fare: 250,
    ride_type: "car",
    created_at: ago(1),
  });

  it("returns 401 when logged out", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await available()).status).toBe(401);
  });

  it("returns 403 for a rider, without touching the database", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    expect((await available()).status).toBe(403);
    expect(fake.calls).toHaveLength(0);
  });

  it("records that the driver is here, but only if they are online", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", { data: AT_PICKUP, error: null });
    fake.queue("rides", { data: [], error: null });

    await available();

    const ops = fake.ops("drivers");
    expect(ops.find((o) => o.method === "update").args[0]).toHaveProperty("last_seen_at");
    expect(ops).toContainEqual({ method: "eq", args: ["user_id", DRIVER.id] });
    expect(ops).toContainEqual({ method: "eq", args: ["is_online", true] });
  });

  it("shows nothing to an offline driver, without looking at rides", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", { data: null, error: null }); // no online row matched

    const data = await (await available()).json();

    expect(data).toEqual({ rides: [] });
    expect(fake.calls.some((c) => c.table === "rides")).toBe(false);
  });

  it("shows nothing when the driver has no location", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", { data: { current_lat: null, current_lng: null }, error: null });

    expect(await (await available()).json()).toEqual({ rides: [] });
    expect(fake.calls.some((c) => c.table === "rides")).toBe(false);
  });

  it("only looks at open requests that haven't expired", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", { data: AT_PICKUP, error: null });
    fake.queue("rides", { data: [], error: null });

    await available();

    const ops = fake.ops("rides");
    expect(ops).toContainEqual({ method: "eq", args: ["status", "requested"] });
    expect(ops.some((o) => o.method === "gte" && o.args[0] === "created_at")).toBe(true);
  });

  it("offers only nearby requests, nearest first, and never the rider's id", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("drivers", { data: AT_PICKUP, error: null });
    fake.queue("rides", {
      data: [
        request("two-km", 18.5488, 73.8475), // about 2 km north
        request("one-km", 18.5398, 73.8475), // about 1 km north
        request("far", 18.5912, 73.7389), // across the city
      ],
      error: null,
    });

    const data = await (await available()).json();

    expect(data.rides.map((r) => r.id)).toEqual(["one-km", "two-km"]);
    expect(JSON.stringify(data)).not.toContain("rider_id");
    const columns = fake.ops("rides").find((o) => o.method === "select").args[0];
    expect(columns).not.toContain("rider_id");
  });
});

describe("GET /api/rides/active: expiry", () => {
  const ride = (overrides) => ({
    id: "ride-1",
    status: "requested",
    pickup_address: "A",
    dropoff_address: "B",
    distance_km: 10,
    duration_min: 20,
    fare: 250,
    ride_type: "car",
    created_at: ago(1),
    rider_id: RIDER.id,
    driver_id: null,
    ...overrides,
  });

  it("cancels a request nobody answered in time, and says so", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [ride({ created_at: ago(20) })], error: null });
    fake.queue("rides", { data: null, error: null }); // the cancelling update

    const data = await (await active()).json();

    expect(data).toEqual({ role: "rider", ride: null, expired: true });
    const ops = fake.ops("rides");
    expect(ops.find((o) => o.method === "update").args[0]).toMatchObject({ status: "cancelled" });
    expect(ops).toContainEqual({ method: "eq", args: ["id", "ride-1"] });
    expect(ops).toContainEqual({ method: "eq", args: ["status", "requested"] });
  });

  it("keeps a request that is still fresh", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [ride({ created_at: ago(2) })], error: null });

    const data = await (await active()).json();

    expect(data.ride.status).toBe("requested");
    expect(data.expired).toBeUndefined();
    expect(fake.ops("rides").some((o) => o.method === "update")).toBe(false);
  });

  it("never expires a ride that already has a driver", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", {
      data: [ride({ status: "accepted", driver_id: DRIVER.id, created_at: ago(60) })],
      error: null,
    });
    fake.queue("users", { data: { name: "Dev Driver" }, error: null });
    fake.queue("drivers", {
      data: { vehicle_model: "Swift", vehicle_number: "MH12", rating_sum: 0, rating_count: 0 },
      error: null,
    });

    const data = await (await active()).json();

    expect(data.ride.status).toBe("accepted");
    expect(fake.ops("rides").some((o) => o.method === "update")).toBe(false);
  });

  it("does not expire anything for a driver", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("rides", {
      data: [ride({ status: "accepted", driver_id: DRIVER.id, created_at: ago(60) })],
      error: null,
    });
    fake.queue("users", { data: { name: "Asha Rider" }, error: null });

    const data = await (await active()).json();

    expect(data.ride.status).toBe("accepted");
    expect(fake.ops("rides").some((o) => o.method === "update")).toBe(false);
  });
});
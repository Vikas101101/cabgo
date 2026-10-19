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
  it("returns 401 when nobody is logged in", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("shows a rider only their own rides", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [{ id: "r1" }], error: null });

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.rides).toHaveLength(1);
    expect(fake.ops("rides")).toContainEqual({ method: "eq", args: ["rider_id", RIDER.id] });
  });

  it("shows a driver only rides assigned to them, not every open request", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("rides", { data: [], error: null });

    await GET();

    const ops = fake.ops("rides");
    expect(ops).toContainEqual({ method: "eq", args: ["driver_id", DRIVER.id] });
    expect(ops.some((o) => o.method === "or")).toBe(false);
  });
});

describe("POST /api/rides (booking a ride)", () => {
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

  it("returns 409 when the rider already has an active ride", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [{ id: "old-ride" }], error: null });

    const res = await POST(jsonRequest(BODY));

    expect(res.status).toBe(409);
    expect(getRoute).not.toHaveBeenCalled(); // it stopped before doing any work
  });

  it("saves the ride with a fare worked out by the server, ignoring the browser's price", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    getRoute.mockResolvedValue({ distanceKm: 10, durationMin: 20, path: [] });
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

  it("pings only the online drivers who are within the pickup radius", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    getRoute.mockResolvedValue({ distanceKm: 10, durationMin: 20, path: [] });
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
  });

  it("still books the ride even if the realtime ping fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {}); // hide the expected warning
    getCurrentUser.mockResolvedValue(RIDER);
    getRoute.mockResolvedValue({ distanceKm: 10, durationMin: 20, path: [] });
    notifyUser.mockRejectedValue(new Error("realtime is down"));
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
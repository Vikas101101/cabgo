import { describe, it, expect } from "vitest";
import { GET as listRides, POST as bookRide } from "@/app/api/rides/route.js";
import { GET as availableRides } from "@/app/api/rides/available/route.js";
import { PATCH as rideAction } from "@/app/api/rides/[id]/route.js";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { jsonRequest, ctx, RIDER } from "./helpers/fake.js";

const ID = "3f2a9c1e-5b7d-4e8f-9a6b-1c2d3e4f5a6b";

// Every route, called the way the app calls it
const routes = [
  ["GET /api/rides", () => listRides()],
  ["POST /api/rides", () => bookRide(jsonRequest({}))],
  ["GET /api/rides/available", () => availableRides()],
  ["PATCH /api/rides/[id]", () => rideAction(jsonRequest({ action: "accept" }, "PATCH"), ctx(ID))],
];

describe("authentication", () => {
  // it.each runs the same test once for every item in the list
  it.each(routes)("%s returns 401 when logged out", async (_name, call) => {
    getCurrentUser.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
  });

  it("returns 401 with a plain error message, and no data", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await listRides();
    expect(await res.json()).toEqual({ error: "Not logged in" });
  });
});

describe("roles", () => {
  it("keeps the nearby-requests list for drivers only", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    const res = await availableRides();
    expect(res.status).toBe(403);
  });
});
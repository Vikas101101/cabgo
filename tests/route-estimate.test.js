import { describe, it, expect, vi } from "vitest";
import { POST } from "@/app/api/route-estimate/route.js";
import { auth } from "@clerk/nextjs/server";
import { getRoute } from "@/lib/route";
import { httpError } from "@/lib/http";
import { checkRateLimit } from "@/lib/rateLimit";
import { calculateFare } from "@/lib/fare";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));

const POINTS = {
  pickup: { lat: 18.5308, lng: 73.8475 },
  dropoff: { lat: 18.5912, lng: 73.7389 },
};

const send = (body, headers = { "Content-Type": "application/json" }) =>
  POST(new Request("http://localhost/api/route-estimate", { method: "POST", headers, body }));

const loggedIn = () => auth.mockResolvedValue({ userId: "user_1" });

describe("POST /api/route-estimate", () => {
  it("returns 401 when logged out, without counting against any limit", async () => {
    auth.mockResolvedValue({ userId: null });
    expect((await send(JSON.stringify(POINTS))).status).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("stops when the rate limit is reached, before calling the routing service", async () => {
    loggedIn();
    checkRateLimit.mockResolvedValue(Response.json({ error: "Too many requests" }, { status: 429 }));

    const res = await send(JSON.stringify(POINTS));

    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("estimate:user_1", 30, 60);
    expect(getRoute).not.toHaveBeenCalled();
  });

  it("returns 415 when the body isn't sent as JSON", async () => {
    loggedIn();
    expect((await send(JSON.stringify(POINTS), { "Content-Type": "text/plain" })).status).toBe(415);
  });

  it("returns 400 for a body that isn't valid JSON", async () => {
    loggedIn();
    expect((await send("{oops")).status).toBe(400);
  });

  it("returns 400 for impossible coordinates", async () => {
    loggedIn();
    const res = await send(JSON.stringify({ ...POINTS, pickup: { lat: 200, lng: 0 } }));
    expect(res.status).toBe(400);
    expect(getRoute).not.toHaveBeenCalled();
  });

  it("returns the route and a fare for every ride type", async () => {
    loggedIn();
    getRoute.mockResolvedValue({ distanceKm: 10, durationMin: 20, path: [[18.5, 73.8]] });

    const res = await send(JSON.stringify(POINTS));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.options.map((o) => o.type)).toEqual(["bike", "auto", "car"]);
    expect(data.options.find((o) => o.type === "car").fare).toBe(calculateFare("car", 10, 20));
    expect(data.distance_km).toBe(10);
  });

  it("passes on a deliberate routing error with its own message", async () => {
    loggedIn();
    getRoute.mockRejectedValue(httpError(422, "No driving route found between these places."));

    const res = await send(JSON.stringify(POINTS));

    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("No driving route found between these places.");
  });

  it("hides the details of an unexpected failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    loggedIn();
    getRoute.mockRejectedValue(new Error("secret internal detail"));

    const res = await send(JSON.stringify(POINTS));

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret internal detail");
    log.mockRestore();
  });
});
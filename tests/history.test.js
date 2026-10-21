import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/rides/history/route.js";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { fake, RIDER, DRIVER } from "./helpers/fake.js";

const call = (qs = "") => GET(new Request(`http://localhost/api/rides/history${qs}`));

const RIDE = { id: "r1", status: "completed", fare: 269 };
const rangeOp = () => fake.ops("rides").find((o) => o.method === "range")?.args;

describe("GET /api/rides/history", () => {
  it("returns 401 when logged out", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it("shows a rider only their own rides, and marks paid ones", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [RIDE, { ...RIDE, id: "r2" }], count: 2, error: null });
    fake.queue("payments", { data: [{ ride_id: "r1", driver_earning: "215.20" }], error: null });

    const data = await (await call()).json();

    expect(fake.ops("rides")).toContainEqual({ method: "eq", args: ["rider_id", RIDER.id] });
    expect(data.rides[0].paid).toBe(true);
    expect(data.rides[1].paid).toBe(false);
    expect(data.rides[0]).not.toHaveProperty("earning"); // riders don't see the driver's share
  });

  it("shows a driver only rides they drove, with their earning", async () => {
    getCurrentUser.mockResolvedValue(DRIVER);
    fake.queue("rides", { data: [RIDE], count: 1, error: null });
    fake.queue("payments", { data: [{ ride_id: "r1", driver_earning: "215.20" }], error: null });

    const data = await (await call()).json();

    expect(fake.ops("rides")).toContainEqual({ method: "eq", args: ["driver_id", DRIVER.id] });
    expect(data.rides[0].earning).toBe(215.2);
  });

  it("never selects the rider or driver ids", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [], count: 0, error: null });
    await call();
    const columns = fake.ops("rides").find((o) => o.method === "select").args[0];
    expect(columns).not.toContain("rider_id");
    expect(columns).not.toContain("driver_id");
  });

  it("filters by status", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [], count: 0, error: null });
    await call("?status=completed");
    expect(fake.ops("rides")).toContainEqual({ method: "in", args: ["status", ["completed"]] });
  });

  it("groups requested, accepted and in-progress rides as active", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [], count: 0, error: null });
    await call("?status=active");
    expect(fake.ops("rides")).toContainEqual({
      method: "in",
      args: ["status", ["requested", "accepted", "in_progress"]],
    });
  });

  it("treats an unknown filter as 'all'", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    for (const bad of ["bogus", "constructor", "__proto__", ""]) {
      fake.reset();
      fake.queue("rides", { data: [], count: 0, error: null });
      await call(`?status=${bad}`);
      expect(fake.ops("rides").some((o) => o.method === "in")).toBe(false);
    }
  });

  it("returns the right slice for page 2, and counts the pages", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [RIDE], count: 25, error: null });
    fake.queue("payments", { data: [], error: null });

    const data = await (await call("?page=2")).json();

    expect(rangeOp()).toEqual([10, 19]);
    expect(data).toMatchObject({ page: 2, total: 25, total_pages: 3 });
  });

  it("falls back to page 1 for a bad page number, and caps a huge one", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    for (const [bad, expected] of [
      ["abc", [0, 9]],
      ["0", [0, 9]],
      ["-5", [0, 9]],
      ["2.5x", [0, 9]].slice(0, 0).length ? ["", [0, 9]] : ["", [0, 9]],
      ["99999", [9990, 9999]],
    ]) {
      fake.reset();
      fake.queue("rides", { data: [], count: 0, error: null });
      await call(`?page=${bad}`);
      expect(rangeOp()).toEqual(expected);
    }
  });

  it("does not look up payments when there are no rides", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: [], count: 0, error: null });
    const data = await (await call()).json();
    expect(data).toMatchObject({ rides: [], total: 0, total_pages: 1 });
    expect(fake.calls.some((c) => c.table === "payments")).toBe(false);
  });

  it("returns an empty page instead of an error when the page is past the end", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: null, count: null, error: { code: "PGRST103", message: "range" } });
    const res = await call("?page=50");
    expect(res.status).toBe(200);
    expect((await res.json()).rides).toEqual([]);
  });

  it("returns 500 on a database error", async () => {
    getCurrentUser.mockResolvedValue(RIDER);
    fake.queue("rides", { data: null, count: null, error: { code: "XX000", message: "database down" } });
    expect((await call()).status).toBe(500);
  });
});

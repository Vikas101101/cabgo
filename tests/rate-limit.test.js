import { describe, it, expect, vi } from "vitest";
import { POST as bookRide } from "@/app/api/rides/route.js";
import { POST as createOrder } from "@/app/api/payments/create-order/route.js";
import { POST as verifyPayment } from "@/app/api/payments/verify/route.js";
import { PATCH as updateProfile } from "@/app/api/users/me/route.js";
import { PATCH as updateDriver } from "@/app/api/driver/route.js";
import { POST as postReview } from "@/app/api/reviews/route.js";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { fake, jsonRequest, RIDER, DRIVER } from "./helpers/fake.js";

// The profile route imports Clerk, which we don't need here
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn(), auth: vi.fn(), currentUser: vi.fn() }));

// The setup file replaces checkRateLimit with a fake. Here we test the REAL one.
const real = (await vi.importActual("@/lib/rateLimit")).checkRateLimit;

describe("checkRateLimit (the real one)", () => {
  it("allows a request that is within the limit", async () => {
    fake.queue("rpc:rate_limit_hit", { data: true, error: null });
    expect(await real("book:rider-1", 10, 60)).toBeNull();
  });

  it("sends the key, the limit and the window to the database", async () => {
    fake.queue("rpc:rate_limit_hit", { data: true, error: null });
    await real("book:rider-1", 10, 60);
    expect(fake.ops("rpc:rate_limit_hit")[0].args[0]).toEqual({
      p_key: "book:rider-1",
      p_window_seconds: 60,
      p_max: 10,
    });
  });

  it("answers 429 with a Retry-After header when the limit is exceeded", async () => {
    fake.queue("rpc:rate_limit_hit", { data: false, error: null });

    const res = await real("book:rider-1", 10, 60);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect((await res.json()).error).toMatch(/Too many requests/);
  });

  it("lets requests through when the database call fails (fails open)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fake.queue("rpc:rate_limit_hit", { data: null, error: { message: "database down" } });
    expect(await real("book:rider-1", 10, 60)).toBeNull();
    warn.mockRestore();
  });

  it("lets requests through when the call blows up completely", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // nothing queued, so the fake rejects
    expect(await real("book:rider-1", 10, 60)).toBeNull();
    warn.mockRestore();
  });
});

// [name, how to call it, who may call it, a user who gets 403 (or null), key, max, seconds]
const ROUTES = [
  ["POST /api/rides", () => bookRide(jsonRequest({})), RIDER, DRIVER, "book:rider-1", 10, 60],
  ["POST /api/payments/create-order", () => createOrder(jsonRequest({})), RIDER, DRIVER, "pay:rider-1", 10, 600],
  ["POST /api/payments/verify", () => verifyPayment(jsonRequest({})), RIDER, DRIVER, "verify:rider-1", 20, 600],
  ["PATCH /api/users/me", () => updateProfile(jsonRequest({}, "PATCH")), RIDER, null, "profile:rider-1", 10, 60],
  ["PATCH /api/driver", () => updateDriver(jsonRequest({}, "PATCH")), DRIVER, RIDER, "driver:driver-1", 30, 60],
  ["POST /api/reviews", () => postReview(jsonRequest({})), RIDER, DRIVER, "review:rider-1", 10, 600],
];

describe.each(ROUTES)("%s", (_name, call, user, wrongUser, key, max, seconds) => {
  it("stops at the rate limit and does no more work", async () => {
    getCurrentUser.mockResolvedValue(user);
    checkRateLimit.mockResolvedValue(Response.json({ error: "Too many requests" }, { status: 429 }));

    const res = await call();

    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(key, max, seconds);
    expect(fake.calls).toHaveLength(0); // it never reached the database
  });

  it("doesn't count a logged-out request against anyone", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it.skipIf(!wrongUser)("doesn't count a request from the wrong role", async () => {
    getCurrentUser.mockResolvedValue(wrongUser);
    expect((await call()).status).toBe(403);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});
import { beforeEach, vi } from "vitest";
import { fake } from "./helpers/fake.js";

// Every test file gets these fakes instead of the real thing.

// The database
vi.mock("@/lib/supabase", async () => {
  const { fake } = await import("./helpers/fake.js");
  return { supabase: fake.client };
});

// Who is logged in. Each test decides the answer.
vi.mock("@/lib/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));

// Realtime pings. We only record who would have been pinged.
vi.mock("@/lib/realtime", () => ({ notifyUser: vi.fn() }));

// The rate limiter. By default it lets everything through (it returns nothing).
// A test can make it block by returning a 429 response.
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: vi.fn() }));

// The routing service. Keep the real isValidPoint, replace only getRoute.
vi.mock("@/lib/route", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getRoute: vi.fn() };
});

// Before each test: wipe the fake database and clear all recorded calls
beforeEach(() => {
  fake.reset();
  vi.resetAllMocks();
});
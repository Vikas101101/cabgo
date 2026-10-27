import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/health/route.js";
import { fake } from "./helpers/fake.js";

const SECRET = "test-cron-secret";

const call = (headers = { authorization: `Bearer ${SECRET}` }) =>
  GET(new Request("http://localhost/api/health", { headers }));

const queueCounts = () => {
  fake.queue("users", { count: 5, error: null });
  fake.queue("rides", { count: 9, error: null });
  fake.queue("payments", { count: 3, error: null });
};

beforeEach(() => vi.stubEnv("CRON_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health", () => {
  it("runs the three light queries for the right secret", async () => {
    queueCounts();

    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fake.calls.map((c) => c.table)).toEqual(["users", "rides", "payments"]);
    // "head: true" means no rows are downloaded
    expect(fake.ops("rides").find((o) => o.method === "select").args[1]).toMatchObject({ head: true });
  });

  it("refuses a request with no secret, without touching the database", async () => {
    expect((await call({})).status).toBe(401);
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses a wrong secret", async () => {
    expect((await call({ authorization: "Bearer not-the-secret" })).status).toBe(401);
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses everything when the server has no secret set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call({ authorization: "Bearer " })).status).toBe(401);
    expect((await call({ authorization: "Bearer undefined" })).status).toBe(401);
    expect(fake.calls).toHaveLength(0);
  });

  it("hides the details of a database error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.queue("users", { count: null, error: { code: "XX000", message: "table is on fire" } });

    const res = await call();

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("on fire");
    log.mockRestore();
  });
});
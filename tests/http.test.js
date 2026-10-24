import { describe, it, expect, vi } from "vitest";
import { httpError, fail, readJson } from "@/lib/http";

// A request-like object. readJson only needs headers and text().
const req = (body, headers = { "content-type": "application/json" }) => ({
  headers: new Headers(headers),
  text: async () => body,
});

describe("httpError", () => {
  it("carries a status and is marked safe to show", () => {
    const err = httpError(422, "No driving route found");
    expect(err).toMatchObject({ status: 422, expose: true, message: "No driving route found" });
  });
});

describe("fail", () => {
  it("shows the message and status of an error we raised on purpose", async () => {
    const res = fail(httpError(422, "No driving route found"));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "No driving route found" });
  });

  it("hides the details of an ordinary error, and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = fail(new Error("relation \"payments\" does not exist"));
    const text = JSON.stringify(await res.json());

    expect(res.status).toBe(500);
    expect(text).not.toContain("payments");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("hides a database error object", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = fail({ code: "23505", message: 'duplicate key value violates unique constraint "payments_one_success_per_ride"' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("payments_one_success");
    log.mockRestore();
  });

  it("does not trust a status that wasn't marked safe (like Clerk's errors)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("Clerk internal detail"), { status: 422 });
    const res = fail(err);

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("Clerk internal detail");
    log.mockRestore();
  });

  it("copes with a thrown value that isn't an error at all", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(fail(undefined).status).toBe(500);
    expect(fail("oops").status).toBe(500);
    log.mockRestore();
  });
});

describe("readJson", () => {
  it("reads a JSON object", async () => {
    expect(await readJson(req('{"rating":5}'))).toEqual({ rating: 5 });
  });

  it("accepts a content type with extra parts", async () => {
    const r = req("{}", { "content-type": "application/json; charset=utf-8" });
    expect(await readJson(r)).toEqual({});
  });

  it("rejects a body that isn't sent as JSON with 415", async () => {
    await expect(readJson(req("{}", { "content-type": "text/plain" }))).rejects.toMatchObject({ status: 415, expose: true });
    await expect(readJson(req("{}", {}))).rejects.toMatchObject({ status: 415 });
  });

  it("rejects text that isn't valid JSON with 400", async () => {
    await expect(readJson(req("{oops"))).rejects.toMatchObject({ status: 400, message: "Invalid JSON" });
    await expect(readJson(req(""))).rejects.toMatchObject({ status: 400 });
  });

  it("rejects JSON that isn't an object with 400", async () => {
    for (const body of ["null", "[]", "5", '"text"', "true"]) {
      await expect(readJson(req(body))).rejects.toMatchObject({ status: 400 });
    }
  });

  it("rejects a body that says it is too large, without reading it", async () => {
    const text = vi.fn();
    const r = { headers: new Headers({ "content-type": "application/json", "content-length": "50000" }), text };
    await expect(readJson(r)).rejects.toMatchObject({ status: 413 });
    expect(text).not.toHaveBeenCalled();
  });

  it("rejects a body that is too large even when it doesn't say so", async () => {
    const big = JSON.stringify({ note: "x".repeat(11_000) });
    await expect(readJson(req(big))).rejects.toMatchObject({ status: 413 });
  });

  it("counts bytes, not characters", async () => {
    // 4,000 emoji is 4,000 characters (8,000 UTF-16 units) but about 16,000 bytes
    const body = JSON.stringify({ note: "🚕".repeat(4_000) });
    await expect(readJson(req(body))).rejects.toMatchObject({ status: 413 });
  });
});
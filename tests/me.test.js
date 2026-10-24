import { describe, it, expect, vi, afterEach } from "vitest";
import { getMe } from "@/lib/me";

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("getMe", () => {
  it("shares one request between components that ask at the same moment", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ user: { id: "u1", role: "rider" } })));

    const [a, b, c] = await Promise.all([getMe(), getMe(), getMe()]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ id: "u1", role: "rider" });
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("asks again next time, so a different account is never mixed up with the last one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ user: { id: "u1", role: "rider" } })));
    expect((await getMe()).id).toBe("u1");

    vi.stubGlobal("fetch", vi.fn(async () => reply({ user: { id: "u2", role: "driver" } })));
    expect((await getMe()).id).toBe("u2");
  });

  it("reports the server's message when the request fails, and works again afterwards", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ error: "Not logged in" }, 401)));
    await expect(getMe()).rejects.toThrow("Not logged in");

    vi.stubGlobal("fetch", vi.fn(async () => reply({ user: { id: "u1" } })));
    expect(await getMe()).toEqual({ id: "u1" });
  });

  it("gives a plain message when the reply isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 500 })));
    await expect(getMe()).rejects.toThrow("Could not load your account");
  });
});
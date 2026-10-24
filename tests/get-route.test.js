import { describe, it, expect, vi, afterEach } from "vitest";

// The setup file replaces getRoute with a fake. Here we test the REAL one.
const { getRoute } = await vi.importActual("@/lib/route");

const A = { lat: 18.5308, lng: 73.8475 };
const B = { lat: 18.5912, lng: 73.7389 };

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
const mockFetch = (value) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(value));

afterEach(() => vi.unstubAllGlobals());

describe("getRoute", () => {
  it("turns the routing service's answer into km, minutes and a lat/lng path", async () => {
    mockFetch(
      reply({
        code: "Ok",
        routes: [{ distance: 14234, duration: 948, geometry: { coordinates: [[73.84, 18.53], [73.74, 18.59]] } }],
      })
    );

    expect(await getRoute(A, B)).toEqual({
      distanceKm: 14.23,
      durationMin: 15.8,
      path: [[18.53, 73.84], [18.59, 73.74]],
    });
  });

  it("sends longitude before latitude", async () => {
    mockFetch(reply({ code: "Ok", routes: [{ distance: 1, duration: 1, geometry: { coordinates: [] } }] }));
    await getRoute(A, B);
    expect(fetch.mock.calls[0][0]).toContain("73.8475,18.5308;73.7389,18.5912");
  });

  it("reports places that aren't connected by road as 422", async () => {
    mockFetch(reply({ code: "NoRoute" }, 400));
    await expect(getRoute(A, B)).rejects.toMatchObject({ status: 422, expose: true });
  });

  it("reports a failing service as 503", async () => {
    mockFetch(reply({}, 500));
    await expect(getRoute(A, B)).rejects.toMatchObject({ status: 503, expose: true });
  });

  it("reports a network failure as 503", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(getRoute(A, B)).rejects.toMatchObject({ status: 503 });
  });

  it("reports an answer that isn't JSON, or has no routes, as 503", async () => {
    mockFetch(new Response("<html>oops</html>", { status: 200 }));
    await expect(getRoute(A, B)).rejects.toMatchObject({ status: 503 });

    mockFetch(reply({ code: "Ok", routes: [] }));
    await expect(getRoute(A, B)).rejects.toMatchObject({ status: 503 });
  });
});
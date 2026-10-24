import { describe, it, expect } from "vitest";
import config from "../next.config.mjs";

describe("next.config.mjs", () => {
  it("keeps the Tailwind connection (without it the whole app loses its styling)", () => {
    expect(config.turbopack.rules["*.css"].loaders).toContain("@tailwindcss/turbopack");
  });

  it("doesn't announce that this is a Next.js app", () => {
    expect(config.poweredByHeader).toBe(false);
  });

  it("sends the security headers on every page", async () => {
    const rules = await config.headers();
    const everything = rules.find((r) => r.source === "/:path*");
    const headers = Object.fromEntries(everything.headers.map((h) => [h.key, h.value]));

    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("geolocation=(self)");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=");
  });

  it("stops API responses from being stored by shared caches", async () => {
    const rules = await config.headers();
    const api = rules.find((r) => r.source === "/api/:path*");
    expect(api.headers).toContainEqual({ key: "Cache-Control", value: "no-store" });
  });
});
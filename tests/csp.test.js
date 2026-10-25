import { describe, it, expect } from "vitest";
import { buildCsp } from "@/lib/csp.mjs";

// "a 'self'; b x y" becomes { a: ["'self'"], b: ["x", "y"] }
const parse = (csp) =>
  Object.fromEntries(
    csp.split("; ").map((part) => {
      const [name, ...values] = part.split(" ");
      return [name, values];
    })
  );

describe("buildCsp", () => {
  const prod = parse(buildCsp({ dev: false }));
  const dev = parse(buildCsp({ dev: true }));

  it("blocks plugins, a changed base address, forms sent elsewhere, and framing by other sites", () => {
    expect(prod["object-src"]).toEqual(["'none'"]);
    expect(prod["base-uri"]).toEqual(["'self'"]);
    expect(prod["form-action"]).toEqual(["'self'"]);
    expect(prod["frame-ancestors"]).toEqual(["'none'"]);
  });

  it("only allows our own site for anything it doesn't mention", () => {
    expect(prod["default-src"]).toEqual(["'self'"]);
  });

  it("allows eval only while developing", () => {
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(prod["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("allows the hot-reload websocket only while developing", () => {
    expect(dev["connect-src"]).toContain("ws://localhost:*");
    expect(prod["connect-src"]).not.toContain("ws://localhost:*");
  });

  it("never allows a bare wildcard, and scripts never come from http or data", () => {
    for (const [name, values] of Object.entries(prod)) {
      expect(values, name).not.toContain("*");
    }
    expect(prod["script-src"]).not.toContain("http:");
    expect(prod["script-src"]).not.toContain("data:");
  });

  it("allows the services the app uses", () => {
    expect(prod["connect-src"]).toContain("https://*.supabase.co");
    expect(prod["connect-src"]).toContain("wss://*.supabase.co");
    expect(prod["connect-src"]).toContain("https://photon.komoot.io");
    expect(prod["connect-src"]).toContain("https://api.razorpay.com");
    expect(prod["script-src"]).toContain("https://checkout.razorpay.com");
    expect(prod["img-src"]).toContain("https://tile.openstreetmap.org");
    expect(prod["img-src"]).toContain("https://img.clerk.com");
  });

  it("is a single line, so it can be used as a header value", () => {
    expect(buildCsp({ dev: true })).not.toMatch(/[\r\n]/);
  });
});
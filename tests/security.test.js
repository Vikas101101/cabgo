import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd(); // vitest runs from the client folder

// All files under a folder whose name passes the test
function filesUnder(dir, keep) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(full, keep));
    else if (keep(entry.name)) found.push(full);
  }
  return found;
}

const read = (file) => readFileSync(file, "utf8");
const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");
const isJs = (name) => name.endsWith(".js");

const API_ROUTES = filesUnder(path.join(ROOT, "app", "api"), (n) => n === "route.js");
const SOURCE = [
  ...filesUnder(path.join(ROOT, "app"), isJs),
  ...filesUnder(path.join(ROOT, "components"), isJs),
  ...filesUnder(path.join(ROOT, "lib"), isJs),
];

describe("API routes", () => {
  it("finds the routes", () => {
    expect(API_ROUTES.length).toBeGreaterThan(15);
  });

  it("every route checks who is calling (the webhook checks a signature instead)", () => {
    const offenders = [];
    for (const file of API_ROUTES) {
      const src = read(file);
      if (rel(file) === "app/api/payments/webhook/route.js") {
        if (!src.includes("verifyWebhookSignature(")) offenders.push(rel(file));
      } else if (!/getCurrentUser\(\)|await auth\(\)/.test(src)) {
        offenders.push(rel(file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no route sends raw error text to the browser", () => {
    const offenders = API_ROUTES.filter((f) => /error:\s*err\.message/.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("no route reads a JSON body by hand (they use readJson)", () => {
    const offenders = API_ROUTES.filter((f) => read(f).includes("request.json(")).map(rel);
    expect(offenders).toEqual([]);
  });

  it("no route builds a database filter from a string (.or(...) can be injected into)", () => {
    const offenders = API_ROUTES.filter((f) => /\.or\(/.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("the expensive and sensitive routes are rate limited", () => {
    const LIMITED = [
      "app/api/route-estimate/route.js",
      "app/api/rides/route.js",
      "app/api/payments/create-order/route.js",
      "app/api/payments/verify/route.js",
      "app/api/users/me/route.js",
      "app/api/driver/route.js",
      "app/api/reviews/route.js",
    ];
    const offenders = LIMITED.filter((f) => !read(path.join(ROOT, f)).includes("checkRateLimit("));
    expect(offenders).toEqual([]);
  });
});

describe("secrets", () => {
  it("code that runs in the browser only reads NEXT_PUBLIC_ settings", () => {
    const clientFiles = SOURCE.filter((f) => /^\s*["']use client["']/.test(read(f)));
    clientFiles.push(path.join(ROOT, "lib", "supabaseBrowser.js"));

    const offenders = [];
    for (const file of clientFiles) {
      for (const m of read(file).matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        if (!m[1].startsWith("NEXT_PUBLIC_")) offenders.push(`${rel(file)}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no setting that sounds secret is made public with NEXT_PUBLIC_", () => {
    const offenders = [];
    for (const file of SOURCE) {
      const hit = read(file).match(/NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PRIVATE|SERVICE|PASSWORD)/);
      if (hit) offenders.push(`${rel(file)}: ${hit[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it(".gitignore keeps .env files out of Git", () => {
    expect(read(path.join(ROOT, ".gitignore"))).toMatch(/^\.env/m);
  });
});
import { describe, it, expect, vi } from "vitest";
import { fake } from "./helpers/fake.js";

// Pretend Clerk, for this file only
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
import { auth, currentUser } from "@clerk/nextjs/server";

// The setup file replaces getCurrentUser with a fake everywhere.
// Here we want to test the REAL one, so we load the original.
const { getCurrentUser } = await vi.importActual("@/lib/getCurrentUser");

const ROW = { id: "u1", clerk_id: "user_1", role: "rider", name: "Asha Rider" };

describe("getCurrentUser (the real one)", () => {
  it("returns null when nobody is logged in", async () => {
    auth.mockResolvedValue({ userId: null });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns the existing row without creating a new one", async () => {
    auth.mockResolvedValue({ userId: "user_1" });
    fake.queue("users", { data: ROW, error: null });

    expect(await getCurrentUser()).toEqual(ROW);
    expect(fake.ops("users").some((o) => o.method === "insert")).toBe(false);
  });

  it("creates a row from the Clerk profile the first time", async () => {
    auth.mockResolvedValue({ userId: "user_1" });
    currentUser.mockResolvedValue({
      firstName: "Asha",
      lastName: "Rider",
      emailAddresses: [{ emailAddress: "asha@example.com" }],
    });
    fake.queue("users", { data: null, error: null }); // not found
    fake.queue("users", { data: ROW, error: null }); // created

    await getCurrentUser();

    const inserted = fake.ops("users").find((o) => o.method === "insert").args[0];
    expect(inserted).toMatchObject({
      clerk_id: "user_1",
      name: "Asha Rider",
      email: "asha@example.com",
    });
  });

  it("copes when another request created the row at the same moment", async () => {
    auth.mockResolvedValue({ userId: "user_1" });
    currentUser.mockResolvedValue({ firstName: "Asha", lastName: null, emailAddresses: [] });
    fake.queue("users", { data: null, error: null }); // not found
    fake.queue("users", { data: null, error: { code: "23505", message: "duplicate key" } });
    fake.queue("users", { data: ROW, error: null }); // read the row the other request made

    expect(await getCurrentUser()).toEqual(ROW);
  });

  it("still fails on a different database error", async () => {
    auth.mockResolvedValue({ userId: "user_1" });
    currentUser.mockResolvedValue({ firstName: "Asha", lastName: null, emailAddresses: [] });
    fake.queue("users", { data: null, error: null });
    fake.queue("users", { data: null, error: { code: "XX000", message: "database down" } });

    await expect(getCurrentUser()).rejects.toMatchObject({ message: "database down" });
  });
});
import { describe, it, expect, vi } from "vitest";
import { POST } from "@/app/api/receipts/[id]/email/route.js";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { sendReceiptEmail } from "@/lib/receiptEmail";
import { ctx, RIDER } from "./helpers/fake.js";

// Keep the real helpers (like maskEmail), but never send anything
vi.mock("@/lib/receiptEmail", async (importOriginal) => ({
  ...(await importOriginal()),
  sendReceiptEmail: vi.fn(),
}));

const ID = "3f2a9c1e-5b7d-4e8f-9a6b-1c2d3e4f5a6b";
const call = () => POST(new Request("http://localhost/api/receipts/x/email", { method: "POST" }), ctx(ID));

describe("POST /api/receipts/[id]/email", () => {
  it("returns 401 when logged out", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(sendReceiptEmail).not.toHaveBeenCalled();
  });

  it("sends to the logged-in rider and shows only a hidden version of the address", async () => {
    const rider = { ...RIDER, email: "asha@example.com" };
    getCurrentUser.mockResolvedValue(rider);
    sendReceiptEmail.mockResolvedValue({ ok: true, to: "asha@example.com" });

    const res = await call();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ sent: true, to: "a***@example.com" });
    expect(sendReceiptEmail).toHaveBeenCalledWith({ rider, rideId: ID, manual: true });
  });

  it.each([
    [429, "too_soon", "Please wait a minute before sending the receipt again."],
    [503, "not_configured", "Email isn't set up on this server."],
    [502, "delivery_failed", "We couldn't send the email. Please try again later."],
    [409, "receipt_unavailable", "This ride hasn't been paid yet"],
  ])("passes on a %i answer with its message", async (status, code, message) => {
    getCurrentUser.mockResolvedValue({ ...RIDER, email: "asha@example.com" });
    sendReceiptEmail.mockResolvedValue({ ok: false, code, status, message });

    const res = await call();

    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: message });
  });
});
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { splitFare, toPaise, verifyPaymentSignature } from "@/lib/payments";

describe("toPaise", () => {
  it("converts rupees to paise", () => {
    expect(toPaise(269)).toBe(26900);
    expect(toPaise("269.50")).toBe(26950);
  });
});

describe("splitFare", () => {
  it("gives the platform 20% and the driver 80%", () => {
    expect(splitFare(100)).toEqual({ totalPaise: 10000, platformFee: 20, driverEarning: 80 });
  });

  it("always adds up exactly to the fare", () => {
    for (const fare of [40, 99, 173, 269, 1234.5]) {
      const s = splitFare(fare);
      expect(Math.round((s.platformFee + s.driverEarning) * 100)).toBe(s.totalPaise);
    }
  });
});

describe("verifyPaymentSignature", () => {
  const secret = "test_secret";
  const orderId = "order_ABC123";
  const paymentId = "pay_XYZ789";
  const good = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

  it("accepts a genuine signature", () => {
    expect(verifyPaymentSignature({ orderId, paymentId, signature: good, secret })).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const bad = good.slice(0, -1) + (good.endsWith("0") ? "1" : "0");
    expect(verifyPaymentSignature({ orderId, paymentId, signature: bad, secret })).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const forged = crypto.createHmac("sha256", "wrong").update(`${orderId}|${paymentId}`).digest("hex");
    expect(verifyPaymentSignature({ orderId, paymentId, signature: forged, secret })).toBe(false);
  });

  it("rejects a valid signature used with a different payment id", () => {
    expect(verifyPaymentSignature({ orderId, paymentId: "pay_OTHER", signature: good, secret })).toBe(false);
  });

  it("rejects missing values and wrong lengths without crashing", () => {
    expect(verifyPaymentSignature({ orderId, paymentId, signature: "", secret })).toBe(false);
    expect(verifyPaymentSignature({ orderId, paymentId, signature: "short", secret })).toBe(false);
    expect(verifyPaymentSignature({ orderId, paymentId, signature: good, secret: "" })).toBe(false);
  });
});
"use client";

import { useCallback, useEffect, useState } from "react";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

// Loads Razorpay's checkout script once, only when it's needed
function loadCheckoutScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();

    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Could not load the payment window. Check your connection and try again."));
    document.body.appendChild(script);
  });
}

export default function PaymentCard() {
  const [rides, setRides] = useState([]); // completed rides waiting to be paid
  const [payer, setPayer] = useState(null); // name and email, to pre-fill the pop-up
  const [payingId, setPayingId] = useState(null); // the ride we're paying for right now
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/rides/unpaid");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRides(data.rides);
      setPayer(data.payer);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Load when the card first appears, and refresh slowly as a safety net
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  // Refresh instantly when a live ping arrives (for example "ride completed")
  useEffect(() => {
    window.addEventListener("ride-event", load);
    return () => window.removeEventListener("ride-event", load);
  }, [load]);

  // The pop-up gave us proof of payment: ask our server to check it
  async function confirmPayment(response) {
    try {
      const res = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotice("Payment successful. Thank you!");
    } catch (err) {
      setError(
        `We couldn't confirm your payment yet (${err.message}). If money was deducted, it will be confirmed shortly. Refresh the page in a minute.`
      );
    } finally {
      setPayingId(null);
      load();
    }
  }

  async function pay(ride) {
    setPayingId(ride.id);
    setError("");
    setNotice("");

    try {
      await loadCheckoutScript();

      // 1. Ask our server to create an order. We send only the ride id, never an amount.
      const res = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ride_id: ride.id }),
      });
      const order = await res.json();
      if (!res.ok) throw new Error(order.error);

      // 2. Open Razorpay's pop-up for that order
      const checkout = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: "CabGo",
        description: "Ride payment",
        prefill: { name: payer?.name ?? "", email: payer?.email ?? "" },
        theme: { color: "#000000" },
        // Runs after a successful payment
        handler: (response) => confirmPayment(response),
        // Runs if the rider closes the pop-up without paying
        modal: { ondismiss: () => setPayingId(null) },
      });

      // Runs if the payment fails (declined card, and so on)
      checkout.on("payment.failed", (failure) => {
        setError(failure?.error?.description || "The payment failed. Please try again.");
        setPayingId(null);
      });

      checkout.open();
    } catch (err) {
      setError(err.message);
      setPayingId(null);
    }
  }

  // Nothing to show if there's nothing to pay and nothing to report
  if (rides.length === 0 && !notice && !error) return null;

  return (
    <div className="space-y-3 rounded-lg border-2 border-green-600 bg-white p-4 shadow">
      {notice && <p className="rounded bg-green-100 p-3 text-sm text-green-800">{notice}</p>}
      {error && <p className="rounded bg-red-100 p-3 text-sm text-red-800">{error}</p>}

      {rides.length > 0 && (
        <>
          <h2 className="font-semibold">Payment due</h2>
          <ul className="space-y-3">
            {rides.map((ride) => (
              <li key={ride.id} className="rounded border p-3">
                <p className="text-sm font-medium">
                  {ride.pickup_address} → {ride.dropoff_address}
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  <span className="capitalize">{ride.ride_type}</span> · {ride.distance_km} km
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-lg font-bold">₹{ride.fare}</span>
                  <button
                    onClick={() => pay(ride)}
                    disabled={payingId !== null}
                    className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {payingId === ride.id ? "Opening..." : `Pay ₹${ride.fare}`}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
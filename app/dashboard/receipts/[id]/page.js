"use client";

import { PageSkeleton } from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const money = (amount, currency) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount);

const when = (iso) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" });

// One label and value on a row
function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export default function ReceiptPage() {
  const { id } = useParams(); // the ride id from the address
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");

  const [emailing, setEmailing] = useState(false);
  const [emailMessage, setEmailMessage] = useState(null); // { type: "success" | "error", text }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/receipts/${id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (!cancelled) setReceipt(json.receipt);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Runs when the "Email receipt" button is clicked
  async function emailReceipt() {
    setEmailing(true);
    setEmailMessage(null);
    try {
      const res = await fetch(`/api/receipts/${id}/email`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEmailMessage({ type: "success", text: `Receipt sent to ${json.to}.` });
    } catch (err) {
      setEmailMessage({ type: "error", text: err.message });
    } finally {
      setEmailing(false);
    }
  }

  if (error) {
    return (
      <div className="max-w-2xl space-y-4">
        <p className="rounded bg-red-100 p-3 text-sm text-red-800">{error}</p>
        <Link href="/dashboard/history" className="text-sm font-medium underline">
          Back to history
        </Link>
      </div>
    );
  }
  if (!receipt) return <PageSkeleton />;

  return (
    <div className="max-w-2xl space-y-4">
      {/* Buttons and messages. They are hidden when printing. */}
      <div className="space-y-3 print:hidden">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => window.print()}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Print / Save as PDF
          </button>
          <button
            onClick={emailReceipt}
            disabled={emailing}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {emailing ? "Sending..." : "Email receipt"}
          </button>
          <Link
            href="/dashboard/history"
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Back to history
          </Link>
        </div>

        {emailMessage && (
          <p
            className={`rounded p-3 text-sm ${
              emailMessage.type === "success"
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {emailMessage.text}
          </p>
        )}
      </div>

      {/* The receipt itself */}
      <article className="rounded-lg bg-white p-6 text-gray-900 shadow print:shadow-none">
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <p className="text-2xl font-bold">🚕 CabGo</p>
            <p className="text-sm text-gray-500">Ride receipt</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">{receipt.receipt_number}</p>
            <p className="text-gray-500">{when(receipt.paid_at)}</p>
          </div>
        </div>

        <h2 className="mt-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Billed to
        </h2>
        <p className="text-sm">{receipt.rider.name || "Rider"}</p>
        {receipt.rider.email && <p className="text-sm text-gray-500">{receipt.rider.email}</p>}

        <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">Trip</h2>
        <dl className="divide-y">
          <Row label="Date">{when(receipt.ride_date)}</Row>
          <Row label="From">{receipt.pickup_address}</Row>
          <Row label="To">{receipt.dropoff_address}</Row>
          <Row label="Ride type">
            <span className="capitalize">{receipt.ride_type}</span>
          </Row>
          <Row label="Distance">{receipt.distance_km} km</Row>
          {receipt.duration_min !== null && (
            <Row label="Travel time">{Math.round(receipt.duration_min)} min</Row>
          )}
          {receipt.driver && (
            <Row label="Driver">
              {receipt.driver.name || "Your driver"}
              {receipt.driver.vehicle_model && (
                <span className="block text-xs font-normal text-gray-500">
                  {receipt.driver.vehicle_model} · {receipt.driver.vehicle_number}
                </span>
              )}
            </Row>
          )}
        </dl>

        <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Payment
        </h2>
        <dl className="divide-y">
          <Row label="Status">
            <span className="text-green-700">Paid</span>
          </Row>
          {receipt.payment_reference && (
            <Row label="Reference">{receipt.payment_reference}</Row>
          )}
          <div className="flex justify-between py-3 text-lg font-bold">
            <dt>Total paid</dt>
            <dd>{money(receipt.amount, receipt.currency)}</dd>
          </div>
        </dl>

        <p className="mt-6 border-t pt-4 text-xs text-gray-500">
          This is a demo receipt for a learning project. Payments were made in test mode
          and no real money was charged. It is not a tax invoice.
        </p>
      </article>
    </div>
  );
}
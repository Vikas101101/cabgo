"use client";

import ErrorBox from "@/components/ErrorBox";
import { PageSkeleton } from "@/components/Skeleton";
import { useCallback, useEffect, useState } from "react";

const money = (n) => `₹${Number(n).toFixed(2)}`;

export default function EarningsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/earnings");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when a live ping arrives (for example "payment received")
  useEffect(() => {
    window.addEventListener("ride-event", load);
    return () => window.removeEventListener("ride-event", load);
  }, [load]);

  if (error && !data) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <PageSkeleton />;

  const { summary, payments } = data;
  const cards = [
    { label: "Total earned", value: money(summary.total) },
    { label: "Last 7 days", value: money(summary.last_7_days) },
    { label: "Paid rides", value: summary.rides },
    { label: "Average per ride", value: money(summary.average) },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Earnings</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg bg-white p-4 shadow">
            <p className="text-sm text-gray-500">{c.label}</p>
            <p className="text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <p className="rounded bg-yellow-100 p-3 text-sm text-yellow-900">
        You earn 80% of each fare and the platform keeps 20%. This is a demo: earnings are
        tracked here, and no real money is paid out to a bank account.
      </p>

      <div className="rounded-lg bg-white p-4 shadow">
        <h2 className="mb-3 text-lg font-semibold">Recent payments</h2>
        {payments.length === 0 ? (
          <p className="text-gray-500">No paid rides yet.</p>
        ) : (
          <ul className="divide-y">
            {payments.map((p, i) => (
              <li key={i} className="flex justify-between gap-4 py-3 text-sm">
                <div>
                  <p>
                    {p.pickup_address} → {p.dropoff_address}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(p.paid_at).toLocaleString()} · fare {money(p.fare)}
                  </p>
                </div>
                <span className="font-semibold text-green-700">+{money(p.earning)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
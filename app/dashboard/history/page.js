"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "active", label: "Active" },
];

const BADGE = {
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  requested: "bg-yellow-100 text-yellow-800",
  accepted: "bg-blue-100 text-blue-800",
  in_progress: "bg-blue-100 text-blue-800",
};

const money = (n) => `₹${Number(n).toFixed(2)}`;

const when = (iso) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export default function HistoryPage() {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0); // changing this reloads the list

  // Load the list whenever the filter, the page, or reloadKey changes
  useEffect(() => {
    let cancelled = false; // set to true if the choices change before the answer arrives

    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/rides/history?status=${filter}&page=${page}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [filter, page, reloadKey]);

  // Reload when a live ping arrives (a ride finished, a payment came in, ...)
  useEffect(() => {
    const refresh = () => setReloadKey((k) => k + 1);
    window.addEventListener("ride-event", refresh);
    return () => window.removeEventListener("ride-event", refresh);
  }, []);

  function chooseFilter(key) {
    setFilter(key);
    setPage(1); // a new filter starts again from the first page
  }

  const isDriver = data?.role === "driver";

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Ride history</h1>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => chooseFilter(f.key)}
            className={`rounded-full px-4 py-1 text-sm font-medium ${
              filter === f.key
                ? "bg-black text-white"
                : "bg-white text-gray-700 shadow hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded bg-red-100 p-3 text-sm text-red-800">{error}</p>}
      {!data && loading && <p>Loading...</p>}

      {data && (
        <div className={`space-y-3 ${loading ? "opacity-60" : ""}`}>
          {data.rides.length === 0 && (
            <p className="rounded-lg bg-white p-6 text-center text-gray-500 shadow">
              No rides to show here yet.
            </p>
          )}

          {data.rides.map((ride) => (
            <div key={ride.id} className="rounded-lg bg-white p-4 shadow">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-gray-500">{when(ride.created_at)}</p>
                <span
                  className={`rounded px-2 py-1 text-xs font-medium capitalize ${
                    BADGE[ride.status] ?? "bg-gray-100 text-gray-800"
                  }`}
                >
                  {ride.status.replace("_", " ")}
                </span>
              </div>

              <p className="mt-2 text-sm font-medium">
                {ride.pickup_address} → {ride.dropoff_address}
              </p>

              <p className="mt-1 text-xs text-gray-600">
                <span className="capitalize">{ride.ride_type}</span> · {ride.distance_km} km
                {ride.duration_min ? ` · ${Math.round(ride.duration_min)} min` : ""}
              </p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-lg font-bold">{money(ride.fare)}</span>

                {ride.status === "completed" && (
                  <div className="flex items-center gap-3 text-sm">
                    {isDriver ? (
                      ride.paid ? (
                        <span className="font-medium text-green-700">
                          You earned {money(ride.earning)}
                        </span>
                      ) : (
                        <span className="text-gray-500">Awaiting payment</span>
                      )
                    ) : ride.paid ? (
                      <>
                        <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                          Paid
                        </span>
                        <Link
                          href={`/dashboard/receipts/${ride.id}`}
                          className="font-medium text-blue-700 underline"
                        >
                          View receipt
                        </Link>
                      </>
                    ) : (
                      <span className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                        Payment due
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Page controls */}
          {data.total_pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {data.total_pages} · {data.total} rides
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.total_pages || loading}
                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
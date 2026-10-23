"use client";

import ErrorBox from "@/components/ErrorBox";
import { CardSkeleton } from "@/components/Skeleton";
import { useCallback, useEffect, useState } from "react";
import { Stars } from "@/components/StarRating";

const day = (iso) => new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });

export default function DriverRatingCard() {
  const [data, setData] = useState(null); // { summary, reviews }
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reviews/driver");
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

  // Refresh instantly when a live ping arrives (for example "new rating")
  useEffect(() => {
    window.addEventListener("ride-event", load);
    return () => window.removeEventListener("ride-event", load);
  }, [load]);

  if (error && !data) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <CardSkeleton lines={2} />;

  const { summary, reviews } = data;

  return (
    <div className="space-y-4 rounded-lg bg-white p-4 shadow">
      <h2 className="text-lg font-semibold">Your rating</h2>

      {summary.count === 0 ? (
        <p className="text-sm text-gray-500">
          No ratings yet. Riders can rate you after each completed ride.
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <p className="text-4xl font-bold">{summary.average.toFixed(1)}</p>
          <div>
            <Stars value={summary.average} size="text-xl" />
            <p className="text-sm text-gray-600">
              from {summary.count} rating{summary.count === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      )}

      {reviews.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Recent reviews
          </h3>
          <ul className="divide-y">
            {reviews.map((r, i) => (
              <li key={i} className="py-3">
                <div className="flex items-center justify-between">
                  <Stars value={r.rating} />
                  <span className="text-xs text-gray-500">{day(r.created_at)}</span>
                </div>
                {r.comment ? (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">{r.comment}</p>
                ) : (
                  <p className="mt-1 text-sm italic text-gray-500">No comment</p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-500">Reviews are anonymous.</p>
        </div>
      )}
    </div>
  );
}
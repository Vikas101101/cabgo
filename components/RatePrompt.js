"use client";

import { useCallback, useEffect, useState } from "react";
import { StarInput } from "@/components/StarRating";
import { useAutoRefresh } from "@/lib/useAutoRefresh";

const MAX_COMMENT = 500;

// The form for ONE ride. The parent gives it key={ride.id}, so every ride
// starts with a fresh, empty form.
function RateForm({ ride, remaining, onDone, onSkip, onReload }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault(); // stop the browser from reloading the page

    if (!rating) {
      setError("Tap a star to choose a rating.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ride_id: ride.id, rating, comment }),
      });
      const json = await res.json();

      if (!res.ok) {
        // "Already rated" means our list is out of date, so refresh it
        if (res.status === 409) onReload();
        throw new Error(json.error);
      }
      onDone();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  const completed = new Date(ride.completed_at).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <h2 className="font-semibold">
          How was your ride with {ride.driver_name || "your driver"}?
        </h2>
        <p className="text-xs text-gray-500">
          {ride.pickup_address} → {ride.dropoff_address} · {completed}
        </p>
      </div>

      <StarInput value={rating} onChange={setRating} disabled={submitting} />

      <div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          aria-label="Comment (optional)"
          maxLength={MAX_COMMENT}
          rows={3}
          disabled={submitting}
          placeholder="Add a comment (optional)"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <p className="text-right text-xs text-gray-500">
          {comment.length}/{MAX_COMMENT}
        </p>
      </div>

        {error && <p role="alert" className="rounded bg-red-100 p-3 text-sm text-red-800">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? "Sending..." : "Submit review"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="text-sm text-gray-600 underline disabled:opacity-50"
        >
          Maybe later
        </button>
        {remaining > 0 && (
          <span className="text-xs text-gray-500">
            {remaining} more ride{remaining > 1 ? "s" : ""} to rate
          </span>
        )}
      </div>
    </form>
  );
}

export default function RatePrompt() {
  const [rides, setRides] = useState([]); // completed rides waiting for a rating
  const [hiddenIds, setHiddenIds] = useState([]); // rated or skipped in this visit
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reviews/pending");
      const json = await res.json();
      if (res.ok) setRides(json.rides);
    } catch {
      // A failed refresh isn't worth an error message. We'll try again soon.
    }
  }, []);

  useAutoRefresh(load, 30000);

  // Hide the thank-you message after a few seconds
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const hide = (id) => setHiddenIds((ids) => [...ids, id]);

  const visible = rides.filter((r) => !hiddenIds.includes(r.id));
  const current = visible[0]; // one ride at a time

  // Nothing to rate and nothing to say
  if (!current && !notice) return null;

  return (
    <div className="space-y-3 rounded-lg border-2 border-yellow-500 bg-white p-4 shadow">
      {notice && <p className="rounded bg-green-100 p-3 text-sm text-green-800">{notice}</p>}

      {current && (
        <RateForm
          key={current.id}
          ride={current}
          remaining={visible.length - 1}
          onDone={() => {
            hide(current.id);
            setNotice("Thanks! Your rating helps keep rides safe and friendly.");
          }}
          onSkip={() => hide(current.id)}
          onReload={load}
        />
      )}
    </div>
  );
}
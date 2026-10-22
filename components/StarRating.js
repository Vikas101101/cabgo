"use client";

import { useState } from "react";

// Read-only stars, for showing a rating: <Stars value={4.7} />
export function Stars({ value, size = "text-lg" }) {
  const filled = Math.round(Number(value) || 0);
  return (
    <span className={size} role="img" aria-label={`${value ?? 0} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= filled ? "text-yellow-500" : "text-gray-300"}>
          ★
        </span>
      ))}
    </span>
  );
}

const LABELS = ["Terrible", "Poor", "Okay", "Good", "Excellent"];

// A star picker: <StarInput value={rating} onChange={setRating} />
export function StarInput({ value, onChange, disabled = false }) {
  const [hover, setHover] = useState(0); // the star the mouse is over
  const shown = hover || value; // what to light up

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Rating"
        className="flex gap-1"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            disabled={disabled}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            className={`text-4xl leading-none ${
              n <= shown ? "text-yellow-500" : "text-gray-300"
            } disabled:opacity-50`}
          >
            ★
          </button>
        ))}
      </div>
      <p className="mt-1 h-5 text-sm text-gray-600">
        {shown ? LABELS[shown - 1] : "Tap a star to rate"}
      </p>
    </div>
  );
}
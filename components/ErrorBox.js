"use client";

// A red error message, with an optional "Try again" button
export default function ErrorBox({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-100 p-4 text-sm text-red-800"
    >
      <p>{message || "Something went wrong."}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded border border-red-300 bg-white px-4 py-2 font-medium hover:bg-red-50"
        >
          Try again
        </button>
      )}
    </div>
  );
}
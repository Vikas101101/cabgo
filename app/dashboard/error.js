"use client"; // error screens must run in the browser

import { useEffect } from "react";
import Link from "next/link";

export default function DashboardError({ error, reset }) {
  // Record the problem in the browser console, so you can investigate it
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="max-w-xl space-y-4 rounded-lg bg-white p-6 shadow">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-sm text-gray-600">
        This page ran into an unexpected problem. Your rides and payments are safe. Try
        again, and if it keeps happening, go back to the overview.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={reset}
          className="min-h-11 rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Back to overview
        </Link>
      </div>
    </div>
  );
}
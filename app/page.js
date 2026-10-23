"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";

export default function Home() {
  const { isLoaded, isSignedIn, user } = useUser();

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center gap-4 bg-black text-white">
      <h1 className="text-4xl font-bold">Cab Booking App</h1>

      {isLoaded && isSignedIn ? (
        <>
          <p className="text-lg">Welcome, {user.firstName || "Rider"} 👋</p>
          <Link
            href="/dashboard"
            className="rounded bg-white px-4 py-2 font-medium text-black hover:bg-gray-200"
          >
            Go to dashboard
          </Link>
        </>
      ) : (
        <p className="text-lg text-gray-500">Please sign up or log in.</p>
      )}
    </main>
  );
}
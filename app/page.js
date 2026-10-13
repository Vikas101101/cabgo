"use client";

import { useUser } from "@clerk/nextjs";

export default function Home() {
  // Ask Clerk who the visitor is
  const { isLoaded, isSignedIn, user } = useUser();

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center gap-4 bg-black text-white">
      <h1 className="text-4xl font-bold">Cab Booking App</h1>

      {isLoaded && isSignedIn ? (
        <p className="text-lg">Welcome, {user.firstName || "Rider"} 👋</p>
      ) : (
        <p className="text-lg text-gray-400">Please sign up or log in.</p>
      )}
    </main>
  );
}
"use client";

import { useCallback, useEffect, useState } from "react";
import ActiveRideCard from "@/components/ActiveRideCard";

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch your profile and rides from the server
  const load = useCallback(async () => {
    try {
      // Ask both API routes at the same time
      const [userRes, ridesRes] = await Promise.all([
        fetch("/api/users/me"),
        fetch("/api/rides"),
      ]);
      const userData = await userRes.json();
      const ridesData = await ridesRes.json();

      if (!userRes.ok) throw new Error(userData.error);
      if (!ridesRes.ok) throw new Error(ridesData.error);

      setUser(userData.user);
      setRides(ridesData.rides);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false); // stop showing "Loading..." either way
    }
  }, []);

  // Load when the page opens
  useEffect(() => {
    load();
  }, [load]);

  // Reload instantly when a live ping arrives
  useEffect(() => {
    window.addEventListener("ride-event", load);
    return () => window.removeEventListener("ride-event", load);
  }, [load]);

  if (loading) return <p>Loading...</p>;
  if (error && !user) return <p className="text-red-600">Error: {error}</p>;

  // Simple numbers for the stat cards
  const total = rides.length;
  const completed = rides.filter((r) => r.status === "completed").length;
  const active = rides.filter((r) =>
    ["requested", "accepted", "in_progress"].includes(r.status)
  ).length;

  const stats = [
    { label: "Total rides", value: total },
    { label: "Active", value: active },
    { label: "Completed", value: completed },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Welcome, {user.name || "there"} 👋
        </h1>
        <p className="text-gray-600">
          Signed in as a <span className="font-semibold">{user.role}</span>
        </p>
      </div>

      <ActiveRideCard />

      {/* Stat cards: 1 column on phones, 3 on larger screens */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-white p-4 shadow">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-3xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Recent rides */}
      <div className="rounded-lg bg-white p-4 shadow">
        <h2 className="mb-3 text-lg font-semibold">Recent rides</h2>
        {rides.length === 0 ? (
          <p className="text-gray-500">No rides yet.</p>
        ) : (
          <ul className="divide-y">
            {rides.slice(0, 5).map((ride) => (
              <li key={ride.id} className="flex justify-between gap-4 py-2 text-sm">
                <span>
                  {ride.pickup_address} → {ride.dropoff_address}
                </span>
                <span className="font-medium capitalize">{ride.status.replace("_", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
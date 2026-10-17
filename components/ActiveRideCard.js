"use client";

import { useCallback, useEffect, useState } from "react";
import RideStatus from "@/components/RideStatus";

const REFRESH_MS = 5000;

export default function ActiveRideCard() {
  const [data, setData] = useState(null); // { role, ride, driver, rider }
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/rides/active");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Load now, then every 5 seconds
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function cancelRide() {
    if (!window.confirm("Cancel this ride?")) return;

    setCancelling(true);
    setError("");
    try {
      const res = await fetch(`/api/rides/${data.ride.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
      load();
    }
  }

  // Nothing to show if there is no active ride
  if (!data?.ride) return null;

  const { ride, driver } = data;
  const isRider = data.role === "rider";

  return (
    <div className="space-y-4 rounded-lg border-2 border-black bg-white p-4 shadow">
      <h2 className="font-semibold">Your current ride</h2>

      <RideStatus status={ride.status} />

      {/* A plain-language message for each stage */}
      {ride.status === "requested" && (
        <p className="text-sm text-gray-600">Looking for a driver near you...</p>
      )}
      {ride.status === "accepted" && isRider && (
        <p className="text-sm text-gray-600">
          <strong>{driver?.name ?? "Your driver"}</strong> is on the way in a{" "}
          {driver?.vehicle_model ?? "vehicle"} ({driver?.vehicle_number ?? "-"}).
        </p>
      )}
      {ride.status === "in_progress" && (
        <p className="text-sm text-gray-600">You're on your way. Enjoy the ride!</p>
      )}

      <div className="space-y-1 text-sm">
        <p><span className="font-medium">Pickup:</span> {ride.pickup_address}</p>
        <p><span className="font-medium">Drop-off:</span> {ride.dropoff_address}</p>
        <p className="text-gray-600">
          <span className="capitalize">{ride.ride_type}</span> · {ride.distance_km} km · ₹{ride.fare}
        </p>
      </div>

      {error && <p className="rounded bg-red-100 p-3 text-sm text-red-800">{error}</p>}

      {isRider && (ride.status === "requested" || ride.status === "accepted") && (
        <button
          onClick={cancelRide}
          disabled={cancelling}
          className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {cancelling ? "Cancelling..." : "Cancel ride"}
        </button>
      )}
    </div>
  );
}
"use client";

import { useCallback, useState } from "react";
import RideStatus from "@/components/RideStatus";
import { useAutoRefresh } from "@/lib/useAutoRefresh";

const REFRESH_MS = 30000;

export default function ActiveRideCard() {
  const [data, setData] = useState(null); // { role, ride, driver, rider }
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/rides/active");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
      if (json.expired) setExpired(true);
      else if (json.ride) setExpired(false);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useAutoRefresh(load, REFRESH_MS);

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
      // Announce the change, so this card AND the dashboard stats refresh
      window.dispatchEvent(new CustomEvent("ride-event"));
    }
  }

  // Nothing to show if there is no active ride
  if (!data?.ride) {
    if (!expired) return null;
    return (
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-yellow-100 p-4 text-sm text-yellow-900"
      >
        <p>No driver accepted your request in time, so it was cancelled. You can book again.</p>
        <button
          type="button"
          onClick={() => setExpired(false)}
          className="rounded border border-yellow-300 bg-white px-3 py-2 font-medium"
        >
          Dismiss
        </button>
      </div>
    );
  }

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

      {isRider && driver && ride.status !== "requested" && (
        <p className="text-sm text-gray-600">
          {driver.rating?.count > 0 ? (
            <>
              <span className="text-yellow-500">★</span> {driver.rating.average.toFixed(1)} (
              {driver.rating.count} rating{driver.rating.count === 1 ? "" : "s"})
            </>
          ) : (
            "New driver, no ratings yet"
          )}
        </p>
      )}

      {ride.status === "in_progress" && (
        <p className="text-sm text-gray-600">You&apos;re on your way. Enjoy the ride!</p>
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
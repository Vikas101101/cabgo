"use client";

import { useCallback, useEffect, useState } from "react";
import RideStatus from "@/components/RideStatus";

const REFRESH_MS = 30000; // safety-net refresh every 30 seconds (pings make it instant)

export default function DriverRides({ isOnline }) {
  const [available, setAvailable] = useState([]); // nearby requests
  const [active, setActive] = useState(null); // the ride this driver is doing: { ride, rider }
  const [hiddenIds, setHiddenIds] = useState([]); // requests the driver declined
  const [workingId, setWorkingId] = useState(null); // ride we're sending a change for
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Fetch the latest data from the server
  const load = useCallback(async () => {
    try {
      // 1. Is the driver already on a ride?
      const activeRes = await fetch("/api/rides/active");
      const activeData = await activeRes.json();
      if (!activeRes.ok) throw new Error(activeData.error);
      setActive(activeData.ride ? activeData : null);

      // 2. If not, and online, fetch nearby requests
      if (isOnline && !activeData.ride) {
        const res = await fetch("/api/rides/available");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setAvailable(data.rides);
      } else {
        setAvailable([]);
      }
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [isOnline]);

  // Load now, then every 5 seconds. Stop when the page closes.
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

    // Refresh instantly when a live ping arrives
  useEffect(() => {
    window.addEventListener("ride-event", load);
    return () => window.removeEventListener("ride-event", load);
  }, [load]);

  // One helper for accept, start and complete
  async function act(id, action, doneMessage = "") {
    setWorkingId(id);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/rides/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (doneMessage) setNotice(doneMessage);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorkingId(null);
      load(); // refresh either way
    }
  }

  // "Decline" only hides the request on this screen (it stays open for other drivers)
  function decline(id) {
    setHiddenIds((ids) => [...ids, id]);
  }

  const visible = available.filter((r) => !hiddenIds.includes(r.id));
  const ride = active?.ride;

  return (
    <div className="space-y-4">
      {error && <p className="rounded bg-red-100 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p className="rounded bg-green-100 p-3 text-sm text-green-800">{notice}</p>}

      {/* The ride the driver is currently doing */}
      {ride && (
        <div className="space-y-4 rounded-lg border-2 border-black bg-white p-4 shadow">
          <h2 className="font-semibold">Your current ride</h2>

          <RideStatus status={ride.status} />

          <div className="space-y-1 text-sm">
            <p><span className="font-medium">Rider:</span> {active.rider?.name ?? "Rider"}</p>
            <p><span className="font-medium">Pickup:</span> {ride.pickup_address}</p>
            <p><span className="font-medium">Drop-off:</span> {ride.dropoff_address}</p>
            <p className="text-gray-600">{ride.distance_km} km · ₹{ride.fare}</p>
          </div>

          {ride.status === "accepted" && (
            <button
              onClick={() => act(ride.id, "start")}
              disabled={workingId === ride.id}
              className="w-full rounded bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {workingId === ride.id ? "Starting..." : "Start ride"}
            </button>
          )}

          {ride.status === "in_progress" && (
            <button
              onClick={() => act(ride.id, "complete", `Ride completed. Fare: ₹${ride.fare}.`)}
              disabled={workingId === ride.id}
              className="w-full rounded bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {workingId === ride.id ? "Completing..." : "Complete ride"}
            </button>
          )}
        </div>
      )}

      {/* Nearby requests, shown only when the driver has no active ride */}
      {!ride && (
        <div className="rounded-lg bg-white p-4 shadow">
          <h2 className="mb-3 font-semibold">Ride requests near you</h2>

          {!isOnline && <p className="text-sm text-gray-500">Go online to see ride requests.</p>}

          {isOnline && visible.length === 0 && (
            <p className="text-sm text-gray-500">
              No requests within 5 km right now. This list refreshes every few seconds.
            </p>
          )}

          <ul className="space-y-3">
            {visible.map((r) => (
              <li key={r.id} className="rounded border p-3">
                <p className="text-sm font-medium">
                  {r.pickup_address} → {r.dropoff_address}
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  <span className="capitalize">{r.ride_type}</span> · {r.distance_km} km trip ·
                  pickup {r.pickup_distance_km} km away
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-lg font-bold">₹{r.fare}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => decline(r.id)}
                      disabled={workingId === r.id}
                      className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => act(r.id, "accept")}
                      disabled={workingId !== null}
                      className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {workingId === r.id ? "Accepting..." : "Accept"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
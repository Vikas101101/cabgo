"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import LocationSearch from "@/components/LocationSearch";
import ErrorBox from "@/components/ErrorBox";
import { Skeleton } from "@/components/Skeleton";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full sm:h-[400px]" />,
});

// A short piece of text that identifies a pair of places. It lets us tell which
// answer from the server belongs to the places chosen right now.
const keyFor = (pickup, dropoff) =>
  pickup && dropoff ? `${pickup.lat},${pickup.lng}>${dropoff.lat},${dropoff.lng}` : null;

export default function BookRidePage() {
  const router = useRouter(); // lets us move to another page from code

  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);

  // The server's answer, labelled with the places it was worked out for:
  // { key, data } when it worked, or { key, error } when it didn't
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0); // bumped by "Try again"

  const [rideType, setRideType] = useState("auto");
  const [requesting, setRequesting] = useState(false);
  const [requestFailure, setRequestFailure] = useState(null); // { key, message }

  // Everything below is worked out from the state above, so nothing needs resetting
  const key = keyFor(pickup, dropoff);
  const current = result && result.key === key ? result : null; // only if it's for these places
  const estimate = current?.data ?? null;
  const estimateError = current?.error ?? "";
  const estimating = Boolean(key) && !current;
  const requestError = requestFailure && requestFailure.key === key ? requestFailure.message : "";

  // Get the route and fares whenever the pair of places changes (or on "Try again")
  useEffect(() => {
    if (!key) return;

    let cancelled = false; // set to true if the places change before the answer arrives

    async function loadEstimate() {
      try {
        const res = await fetch("/api/route-estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickup: { lat: pickup.lat, lng: pickup.lng },
            dropoff: { lat: dropoff.lat, lng: dropoff.lng },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!cancelled) setResult({ key, data });
      } catch (err) {
        if (!cancelled) setResult({ key, error: err.message });
      }
    }

    loadEstimate();
    return () => {
      cancelled = true;
    };
    // The places are described by `key`, so they don't need to be listed separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  function retry() {
    setResult(null);
    setAttempt((n) => n + 1);
  }

  // Runs when the rider clicks "Request ride"
  async function handleRequest() {
    setRequesting(true);
    setRequestFailure(null);

    try {
      const res = await fetch("/api/rides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // We send places and ride type only. The server works out the price.
        body: JSON.stringify({
          pickup: { address: pickup.label, lat: pickup.lat, lng: pickup.lng },
          dropoff: { address: dropoff.label, lat: dropoff.lat, lng: dropoff.lng },
          ride_type: rideType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Success: go to the dashboard, where the new ride is listed
      router.push("/dashboard");
    } catch (err) {
      setRequestFailure({ key, message: err.message });
      setRequesting(false);
    }
    // On success we leave the page, so we don't need to re-enable the button
  }

  // On a phone the fares appear below the map. Scroll them into view when they arrive.
  const summaryRef = useRef(null);
  useEffect(() => {
    if (estimate && summaryRef.current) {
      summaryRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [estimate]);

  const selected = estimate?.options.find((o) => o.type === rideType);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Book a ride</h1>

      <div className="grid gap-4 rounded-lg bg-white p-4 shadow md:grid-cols-2">
        <LocationSearch
          label="Pickup location"
          placeholder="Where should we pick you up?"
          onSelect={setPickup}
        />
        <LocationSearch
          label="Drop-off location"
          placeholder="Where are you going?"
          onSelect={setDropoff}
        />
      </div>

      <MapView pickup={pickup} dropoff={dropoff} path={estimate?.path} />

      {pickup && dropoff && (
        <div ref={summaryRef} className="scroll-mb-24 rounded-lg bg-white p-4 shadow">
          {estimating && <p className="text-gray-600">Calculating route...</p>}
          {estimateError && <ErrorBox message={estimateError} onRetry={retry} />}

          {estimate && (
            <div className="space-y-4">
              <div className="flex gap-8">
                <div>
                  <p className="text-sm text-gray-500">Distance</p>
                  <p className="text-xl font-bold">{estimate.distance_km} km</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Travel time</p>
                  <p className="text-xl font-bold">{Math.round(estimate.duration_min)} min</p>
                </div>
              </div>

              {/* Ride type choices */}
              <div>
                <p className="mb-2 text-sm font-medium">Choose a ride type</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {estimate.options.map((o) => (
                    <button
                      key={o.type}
                      type="button"
                      onClick={() => setRideType(o.type)}
                      className={`rounded border-2 p-3 text-left ${
                        rideType === o.type
                          ? "border-black bg-gray-100"
                          : "border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      <p className="font-medium">{o.label}</p>
                      <p className="text-lg font-bold">₹{o.fare}</p>
                    </button>
                  ))}
                </div>
              </div>

              {requestError && (
                <p role="alert" className="rounded bg-red-100 p-3 text-sm text-red-800">
                  {requestError}
                </p>
              )}

              <button
                type="button"
                onClick={handleRequest}
                disabled={requesting}
                className="w-full rounded bg-black px-5 py-3 font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {requesting
                  ? "Requesting..."
                  : `Request ${selected?.label ?? "ride"} for ₹${selected?.fare ?? ""}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
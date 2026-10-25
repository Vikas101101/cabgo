"use client";

import { PageSkeleton } from "@/components/Skeleton";
import DriverRides from "@/components/DriverRides";
import { useEffect, useState } from "react";
import LocationSearch from "@/components/LocationSearch";


export default function DriverPage() {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [driver, setDriver] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { type: "success" | "error", text }

  // Registration form values
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");

  // Load the driver info when the page opens
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/driver");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setRole(data.role);
        setDriver(data.driver);
      } catch (err) {
        setMessage({ type: "error", text: err.message });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Register as a driver
  async function handleRegister(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/driver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_model: vehicleModel,
          vehicle_number: vehicleNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Reload the whole page so the sidebar picks up the new role
      window.location.reload();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
      setBusy(false);
    }
  }

  // Send changes (online/offline and/or location) to the server
  async function updateDriver(changes) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/driver", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDriver(data.driver);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  function toggleOnline() {
    updateDriver({
      is_online: !driver.is_online,
      lat: driver.current_lat,
      lng: driver.current_lng,
    });
  }

  // The driver picked a place from the search box
  function handleSetLocation(place) {
    if (!place) return;
    updateDriver({ is_online: driver.is_online, lat: place.lat, lng: place.lng });
  }

  // Use the device's GPS
  function useMyLocation() {
    if (!navigator.geolocation) {
      setMessage({ type: "error", text: "Your browser doesn't support location." });
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateDriver({
          is_online: driver.is_online,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setBusy(false);
        setMessage({
          type: "error",
          text: "Could not get your location. Allow location access, or search for a place instead.",
        });
      }
    );
  }

  if (loading) return <PageSkeleton />;

  const messageBox = message && (
    <p
      className={`rounded p-3 text-sm ${
        message.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      }`}
    >
      {message.text}
    </p>
  );

  // ----- A rider: show the registration form -----
  if (role !== "driver") {
    return (
      <div className="max-w-xl space-y-6">
        <h1 className="text-2xl font-bold">Drive with us</h1>
        {messageBox}

        <p className="rounded bg-yellow-100 p-3 text-sm text-yellow-900">
          Registering turns this account into a <strong>driver account</strong>. Driver
          accounts can accept rides but can&apos;t book them. To test both sides, use a
          separate account for each.
        </p>

        <form onSubmit={handleRegister} className="space-y-4 rounded-lg bg-white p-4 shadow">
          <div>
            <label htmlFor="vehicle-model" className="mb-1 block text-sm font-medium">Vehicle model</label>
            <input
              type="text"
              id="vehicle-model"
              value={vehicleModel}
              onChange={(e) => setVehicleModel(e.target.value)}
              placeholder="e.g. Maruti Swift"
              required
              maxLength={60}
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="vehicle-number" className="mb-1 block text-sm font-medium">Vehicle number</label>
            <input
              type="text"
              id="vehicle-number"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              placeholder="e.g. MH12 AB 1234"
              required
              maxLength={15}
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-black px-5 py-2 font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "Registering..." : "Register as a driver"}
          </button>
        </form>
      </div>
    );
  }

  // Role is driver, but the details row is missing (should not normally happen)
  if (!driver) {
    return <p className="text-red-600">Driver details not found. Please contact support.</p>;
  }

  // ----- A driver: show the online/offline controls -----
  const hasLocation = driver.current_lat !== null && driver.current_lng !== null;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Driver dashboard</h1>
      {messageBox}

      {/* Online / offline */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4 shadow">
        <div>
          <p className="text-sm text-gray-500">Your status</p>
          <p className={`text-xl font-bold ${driver.is_online ? "text-green-600" : "text-gray-500"}`}>
            {driver.is_online ? "Online" : "Offline"}
          </p>
        </div>
        <button
          onClick={toggleOnline}
          disabled={busy || (!driver.is_online && !hasLocation)}
          className={`rounded px-5 py-2 font-medium text-white disabled:opacity-50 ${
            driver.is_online ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {driver.is_online ? "Go offline" : "Go online"}
        </button>
      </div>

                <DriverRides isOnline={driver.is_online} />

      {/* Location */}
      <div className="space-y-3 rounded-lg bg-white p-4 shadow">
        <h2 className="font-semibold">Your location</h2>
        <p className="text-sm text-gray-600">
          {hasLocation
            ? `Saved: ${driver.current_lat.toFixed(4)}, ${driver.current_lng.toFixed(4)}`
            : "Not set yet. Set it to go online."}
        </p>

        <LocationSearch
          label="Search for where you are"
          placeholder="e.g. Shivajinagar, Pune"
          onSelect={handleSetLocation}
        />

        <button
          onClick={useMyLocation}
          disabled={busy}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
        >
          Use my GPS location
        </button>
      </div>

      {/* Vehicle */}
      <div className="rounded-lg bg-white p-4 shadow">
        <h2 className="mb-2 font-semibold">Your vehicle</h2>
        <p>{driver.vehicle_model}</p>
        <p className="text-sm text-gray-600">{driver.vehicle_number}</p>
      </div>
    </div>
  );
}
"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";

const PUNE = [18.5204, 73.8567];

// Moves the map so the given points are all visible.
// It must live INSIDE MapContainer to be able to control the map.
function FitToPoints({ points }) {
  const map = useMap();
  // A short text fingerprint, so we only move the map when the points truly change
  const first = points[0]?.join(",");
  const last = points[points.length - 1]?.join(",");
  const key = `${points.length}|${first}|${last}`;

  useEffect(() => {
    if (points.length === 1) {
      map.setView(points[0], 15);
    } else if (points.length >= 2) {
      map.fitBounds(points, { padding: [50, 50] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);

  return null;
}

export default function MapView({ pickup, dropoff, path }) {
  const markerPoints = [pickup, dropoff].filter(Boolean).map((p) => [p.lat, p.lng]);
  // If we have a route, fit the whole route. Otherwise fit the markers.
  const fitPoints = path && path.length > 1 ? path : markerPoints;

  return (
    <div className="isolate h-[400px] w-full overflow-hidden rounded-lg shadow">
      <MapContainer center={PUNE} zoom={12} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* The route line, drawn under the markers */}
        {path && path.length > 1 && (
          <Polyline positions={path} pathOptions={{ color: "#2563eb", weight: 5 }} />
        )}

        {pickup && (
          <CircleMarker
            center={[pickup.lat, pickup.lng]}
            radius={10}
            pathOptions={{ color: "#15803d", fillColor: "#22c55e", fillOpacity: 0.9 }}
          >
            <Tooltip permanent direction="top">Pickup</Tooltip>
          </CircleMarker>
        )}

        {dropoff && (
          <CircleMarker
            center={[dropoff.lat, dropoff.lng]}
            radius={10}
            pathOptions={{ color: "#b91c1c", fillColor: "#ef4444", fillOpacity: 0.9 }}
          >
            <Tooltip permanent direction="top">Drop-off</Tooltip>
          </CircleMarker>
        )}

        <FitToPoints points={fitPoints} />
      </MapContainer>
    </div>
  );
}
"use client";

import { useEffect, useId, useState } from "react";

// Turn one result from Photon into a simple object we can use.
// Photon sends coordinates as [longitude, latitude], so lat is the SECOND number.
function toPlace(feature) {
  const p = feature.properties;
  const parts = [p.name, p.street, p.district, p.city, p.state].filter(Boolean);
  const unique = [...new Set(parts)]; // remove repeated words
  return {
    label: unique.join(", "),
    lat: feature.geometry.coordinates[1],
    lng: feature.geometry.coordinates[0],
  };
}

export default function LocationSearch({ label, placeholder, onSelect }) {
  const inputId = useId(); // a unique id, so the label and the input can be connected
  const listId = `${inputId}-list`;

  const [query, setQuery] = useState(""); // what is typed in the box
  const [results, setResults] = useState([]); // the suggestions
  const [open, setOpen] = useState(false); // is the list showing?
  const [active, setActive] = useState(-1); // which suggestion is highlighted (-1 = none)
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  // Runs whenever the typed text changes
  useEffect(() => {
    // Don't search for very short text, or after a suggestion was chosen
    if (!open || query.trim().length < 3) {
      setResults([]);
      setActive(-1);
      return;
    }

    const controller = new AbortController(); // lets us cancel an old request

    // Wait 500 ms. If the user types again, this timer is cancelled below.
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        setError("");
        // lat and lon nudge results toward Pune
        const url =
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}` +
          `&limit=5&lang=en&lat=18.52&lon=73.85`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setResults(data.features.map(toPlace));
        setActive(-1);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError("Could not search right now. Try again.");
        }
      } finally {
        setSearching(false);
      }
    }, 500);

    // Cleanup: runs before the next search, or when the box disappears
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  // The rider is typing
  function handleChange(e) {
    setQuery(e.target.value);
    setOpen(true);
    onSelect(null); // typing again means the old choice no longer applies
  }

  // The rider chose a suggestion (with the mouse, a tap, or the Enter key)
  function choose(place) {
    setQuery(place.label);
    setOpen(false);
    setResults([]);
    setActive(-1);
    onSelect(place);
  }

  // Keyboard: arrows move through the list, Enter chooses, Escape closes
  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      if (results.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      if (results.length === 0) return;
      e.preventDefault();
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && results[active]) {
        e.preventDefault();
        choose(results[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  }

  const showList = open && results.length > 0;

  return (
    <div className="relative">
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
        {label}
      </label>

      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        className="w-full rounded border border-gray-300 px-3 py-2"
      />

      {/* A hidden message that screen readers announce when suggestions appear */}
      <p className="sr-only" aria-live="polite">
        {showList ? `${results.length} suggestions available. Use the up and down arrow keys to choose.` : ""}
      </p>

      {searching && <p className="mt-1 text-xs text-gray-500">Searching...</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}

      {/* Suggestion list */}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute z-20 mt-1 w-full overflow-hidden rounded border border-gray-200 bg-white shadow-lg"
        >
          {results.map((place, i) => (
            <li
              key={i}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // onMouseDown fires before the box loses focus, so the click isn't lost
              onMouseDown={() => choose(place)}
              className={`cursor-pointer px-3 py-3 text-sm ${
                i === active ? "bg-gray-100" : "hover:bg-gray-100"
              }`}
            >
              {place.label}
            </li>
          ))}
        </ul>
      )}

      {open && !searching && !error && query.trim().length >= 3 && results.length === 0 && (
        <p className="mt-1 text-xs text-gray-500">No places found.</p>
      )}
    </div>
  );
}
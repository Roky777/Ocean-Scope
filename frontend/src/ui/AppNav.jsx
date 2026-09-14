import { useEffect, useRef, useState } from "react";

const SECTIONS = [
  { id: "explore", label: "Explore", hint: "Choose and inspect an ocean layer" },
  { id: "understand", label: "Understand", hint: "Explain the active ocean view" },
  { id: "verify", label: "Verify", hint: "Check model data with real measurements" },
  { id: "analyze", label: "Analyze", hint: "Open scientific controls" },
  { id: "learn", label: "Learn", hint: "Learn ocean science in the live scene" },
];

const SUGGESTED_LOCATIONS = [
  { name: "Bay of Bengal", detail: "Central basin", lat: 15.0, lon: 87.0 },
  { name: "Arabian Sea", detail: "Eastern basin", lat: 15.0, lon: 70.0 },
  { name: "Andaman Sea", detail: "Island waters", lat: 11.7, lon: 92.7 },
  { name: "Lakshadweep Sea", detail: "Coral archipelago", lat: 10.6, lon: 72.6 },
  { name: "Gulf of Mannar", detail: "Southeast coast", lat: 8.8, lon: 79.1 },
];

/**
 * Primary application chrome: identity, section navigation, and the controls
 * that belong to the whole app rather than to one panel.
 */
export default function AppNav({
  mode,
  onMode,
  bounds,
  onCoordinateSearch,
  searchTarget,
  onClearCoordinate,
  onGuide,
  scientificOpen,
  onScientificToggle,
}) {
  const [coordinateOpen, setCoordinateOpen] = useState(false);
  const [latitudeText, setLatitudeText] = useState("");
  const [longitudeText, setLongitudeText] = useState("");
  const [coordinateError, setCoordinateError] = useState("");
  const coordinateRef = useRef(null);

  useEffect(() => {
    if (!coordinateOpen) return;
    const close = (e) => {
      if (coordinateRef.current && !coordinateRef.current.contains(e.target)) {
        setCoordinateOpen(false);
        setCoordinateError("");
      }
    };
    const key = (e) => {
      if (e.key === "Escape") {
        setCoordinateOpen(false);
        setCoordinateError("");
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [coordinateOpen]);

  useEffect(() => {
    const shortcut = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCoordinateOpen(true);
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);

  const parseAxis = (text, positive, negative) => {
    const match = text.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?$/i);
    if (!match) return null;
    let value = Number(match[1]);
    const direction = match[2]?.toUpperCase();
    if (direction && direction !== positive && direction !== negative) return null;
    if (direction === negative) value = -Math.abs(value);
    if (direction === positive) value = Math.abs(value);
    return Number.isFinite(value) ? value : null;
  };

  const submitCoordinate = (e) => {
    e.preventDefault();
    const lat = parseAxis(latitudeText, "N", "S");
    const lon = parseAxis(longitudeText, "E", "W");
    if (lat == null || lon == null) {
      setCoordinateError("Enter valid decimal coordinates in both fields.");
      return;
    }
    const point = { lat, lon };
    if (
      !bounds || point.lat < bounds.lat_min || point.lat > bounds.lat_max ||
      point.lon < bounds.lon_min || point.lon > bounds.lon_max
    ) {
      setCoordinateError(
        `Outside this view (${bounds?.lat_min ?? "—"}–${bounds?.lat_max ?? "—"}° N, ${bounds?.lon_min ?? "—"}–${bounds?.lon_max ?? "—"}° E)`,
      );
      return;
    }
    setCoordinateError("");
    setCoordinateOpen(false);
    onCoordinateSearch(point);
  };

  const chooseSuggestion = (place) => {
    setLatitudeText(String(place.lat));
    setLongitudeText(String(place.lon));
    setCoordinateError("");
    setCoordinateOpen(false);
    onCoordinateSearch({ lat: place.lat, lon: place.lon });
  };

  return (
    <header className="appnav">
      <div className="appnav-brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-lockup"><b>INCOIS</b><span>Ocean Explorer</span></span>
        <span className="brand-sub">Real data. Deeper understanding.</span>
      </div>

      <nav className="appnav-sections" aria-label="Sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={mode === s.id ? "navtab active" : "navtab"}
            onClick={() => onMode(s.id)}
            title={s.hint}
            aria-current={mode === s.id ? "page" : undefined}
          >
            <span className="nav-label-full">{s.label}</span>
            <span className="nav-label-mobile">{s.label}</span>
          </button>
        ))}
      </nav>

      <div className="appnav-right">
        <button className={scientificOpen ? "science-toggle active" : "science-toggle"} onClick={onScientificToggle} aria-pressed={scientificOpen} title="Open scientific controls"><svg className="settings-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.8-1.8.9-1.9-2.2-2.2-1.9.9-1.8-.8-.7-2h-3l-.7 2-1.8.8-1.9-.9L.9 6.1 1.8 8l-.8 1.8-2 .7v3l2 .7.8 1.8-.9 1.9 2.2 2.2 1.9-.9 1.8.8.7 2h3l.7-2 1.8-.8 1.9.9 2.2-2.2-.9-1.9.8-1.8 2-.7Z" transform="translate(2 0) scale(.84)"/></svg><span>Settings</span></button>
        <button className="guide-help" onClick={onGuide} title="Open the getting-started guide" aria-label="Open interface guide">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.8 9a2.4 2.4 0 0 1 4.6 1c0 1.8-2.4 2-2.4 3.8" />
            <path d="M12 17.2h.01" />
          </svg>
          <span>Guide</span>
        </button>
        <div className="coordinate-search" ref={coordinateRef}>
            <button
              className={coordinateOpen ? "coordinate-trigger active" : "coordinate-trigger"}
              onClick={() => {
                setCoordinateOpen((value) => !value);
              }}
              aria-expanded={coordinateOpen}
              aria-haspopup="dialog"
              title="Find a latitude and longitude"
            >
              <span className="location-icon" aria-hidden="true" />
              <span>{searchTarget ? `${searchTarget.lat.toFixed(2)}°, ${searchTarget.lon.toFixed(2)}°` : "Search region"}</span>
              <kbd>⌘K</kbd>
            </button>
            {searchTarget && (
              <button
                className="coordinate-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearCoordinate();
                  setLatitudeText("");
                  setLongitudeText("");
                }}
                aria-label="Remove searched location"
                title="Remove searched location"
              >
                ×
              </button>
            )}
            {coordinateOpen && (
              <form className="coordinate-popover" onSubmit={submitCoordinate} role="dialog" aria-label="Coordinate search">
                <div className="coordinate-popover-head">
                  <div>
                    <strong>Go to location</strong>
                    <span>Move the camera to an exact ocean coordinate.</span>
                  </div>
                </div>
                <div className="coordinate-fields">
                  <label>
                    <span>Latitude</span>
                    <input
                      autoFocus
                      value={latitudeText}
                      onChange={(e) => { setLatitudeText(e.target.value); setCoordinateError(""); }}
                      placeholder="15.2° N"
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    <span>Longitude</span>
                    <input
                      value={longitudeText}
                      onChange={(e) => { setLongitudeText(e.target.value); setCoordinateError(""); }}
                      placeholder="82.4° E"
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  </label>
                </div>
                {coordinateError && <p className="coordinate-error">{coordinateError}</p>}
                <button className="coordinate-go" type="submit">Go to coordinates</button>
                <div className="suggested-locations">
                  <span className="field-label">Suggested locations</span>
                  <div className="location-list">
                    {SUGGESTED_LOCATIONS.map((place) => (
                      <button key={place.name} type="button" onClick={() => chooseSuggestion(place)}>
                        <span className="suggestion-pin" aria-hidden="true" />
                        <span><strong>{place.name}</strong><small>{place.detail}</small></span>
                        <em>{place.lat.toFixed(1)}°, {place.lon.toFixed(1)}°</em>
                      </button>
                    ))}
                  </div>
                </div>
              </form>
            )}
        </div>

      </div>
    </header>
  );
}

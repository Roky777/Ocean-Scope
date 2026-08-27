import { useEffect, useRef, useState } from "react";

const SECTIONS = [
  { id: "explorer", label: "Explorer", mobileLabel: "Explore", hint: "Interactive 3D ocean state" },
  { id: "hazard", label: "Hazard Advisory", mobileLabel: "Hazards", hint: "Derived cyclone-risk bulletin" },
  { id: "about", label: "About / Data Sources", mobileLabel: "About", hint: "Provenance and glossary" },
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
  view,
  onView,
  variables,
  variable,
  onVariable,
  mode,
  onMode,
  alertCount,
  bounds,
  onCoordinateSearch,
  searchTarget,
  onClearCoordinate,
}) {
  const [open, setOpen] = useState(false);
  const [coordinateOpen, setCoordinateOpen] = useState(false);
  const [latitudeText, setLatitudeText] = useState("");
  const [longitudeText, setLongitudeText] = useState("");
  const [coordinateError, setCoordinateError] = useState("");
  const ref = useRef(null);
  const coordinateRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const key = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && view === "explorer") {
        e.preventDefault();
        setCoordinateOpen(true);
        setOpen(false);
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [view]);

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

  const current = variables?.find((v) => v.id === variable);

  return (
    <header className="appnav">
      <div className="appnav-brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">OceanScope</span>
        <span className="brand-sub">India EEZ</span>
      </div>

      <nav className="appnav-sections" aria-label="Sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={view === s.id ? "navtab active" : "navtab"}
            onClick={() => onView(s.id)}
            title={s.hint}
            aria-current={view === s.id ? "page" : undefined}
          >
            <span className="nav-label-full">{s.label}</span>
            <span className="nav-label-mobile">{s.mobileLabel}</span>
            {s.id === "hazard" && alertCount > 0 && (
              <span className="nav-badge" title={`${alertCount} active advisories`}>
                {alertCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="appnav-right">
        {view === "explorer" && (
          <div className="coordinate-search" ref={coordinateRef}>
            <button
              className={coordinateOpen ? "coordinate-trigger active" : "coordinate-trigger"}
              onClick={() => {
                setCoordinateOpen((value) => !value);
                setOpen(false);
              }}
              aria-expanded={coordinateOpen}
              aria-haspopup="dialog"
              title="Find a latitude and longitude"
            >
              <span className="location-icon" aria-hidden="true" />
              <span>{searchTarget ? `${searchTarget.lat.toFixed(2)}°, ${searchTarget.lon.toFixed(2)}°` : "Location"}</span>
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
        )}

        {/* Mode switch: the brief calls for an operational tool AND a public
            outreach view, so this is a first-class control, not a setting.
            It only governs the Explorer view, so it is hidden elsewhere
            rather than sitting there inert. */}
        {view === "explorer" && (
        <div className="modeswitch" role="group" aria-label="Interface mode">
          <button
            className={mode === "forecaster" ? "modebtn active" : "modebtn"}
            onClick={() => onMode("forecaster")}
            title="Full operational controls"
          >
            Forecaster
          </button>
          <button
            className={mode === "explore" ? "modebtn active" : "modebtn"}
            onClick={() => onMode("explore")}
            title="Simplified view for outreach and teaching"
          >
            Explore
          </button>
        </div>
        )}

        {view === "explorer" && variables && (
          <div className="variable-select" ref={ref}>
            <span className="field-label">Variable</span>
            <button
              className={open ? "select-button open" : "select-button"}
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={open}
            >
              {current?.label ?? "—"}
              <span className="chev" aria-hidden="true" />
            </button>
            {open && (
              <ul className="dropdown" role="listbox">
                {variables.map((v) => (
                  <li key={v.id}>
                    <button
                      role="option"
                      aria-selected={v.id === variable}
                      disabled={!v.available}
                      title={v.available ? undefined : v.note || "Coming soon"}
                      className={v.id === variable ? "option active" : "option"}
                      onClick={() => {
                        if (!v.available) return;
                        onVariable(v.id);
                        setOpen(false);
                      }}
                    >
                      <span>{v.label}</span>
                      {!v.available && <span className="soon">Coming soon</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

import { useEffect, useRef, useState } from "react";

const SECTIONS = [
  { id: "explorer", label: "Explorer", hint: "Interactive 3D ocean state" },
  { id: "hazard", label: "Hazard Advisory", hint: "Derived cyclone-risk bulletin" },
  { id: "about", label: "About / Data Sources", hint: "Provenance and glossary" },
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
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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
            {s.label}
            {s.id === "hazard" && alertCount > 0 && (
              <span className="nav-badge" title={`${alertCount} active advisories`}>
                {alertCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="appnav-right">
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

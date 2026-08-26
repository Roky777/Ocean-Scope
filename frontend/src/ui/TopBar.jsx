import { useEffect, useRef, useState } from "react";

/** App identity on the left, variable selector on the centre-right. */
export default function TopBar({ variables, active, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current = variables.find((v) => v.id === active);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">OceanScope</span>
        <span className="brand-sub">Indian Ocean</span>
      </div>

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
                  aria-selected={v.id === active}
                  disabled={!v.available}
                  title={v.available ? undefined : v.note || "Coming soon"}
                  className={v.id === active ? "option active" : "option"}
                  onClick={() => {
                    if (!v.available) return;
                    onChange(v.id);
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
    </header>
  );
}

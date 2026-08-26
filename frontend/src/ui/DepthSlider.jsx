import { useCallback, useEffect, useRef } from "react";

/**
 * Vertical depth selector.
 *
 * Built from a plain div rather than <input type="range"> deliberately. A
 * native range rotated with `writing-mode: vertical-*` puts its minimum at a
 * different end depending on browser and `direction`, which is how the thumb
 * and the highlighted label ended up disagreeing. Here the geometry is
 * explicit: index 0 is the surface and sits at the top, always, and the labels
 * are laid out from the same fractions the handle uses, so the two cannot
 * drift apart.
 */
export default function DepthSlider({ depths, depth, onDepth }) {
  const trackRef = useRef(null);
  const dragging = useRef(false);

  const index = Math.max(0, depths.indexOf(depth));
  const last = depths.length - 1;
  const fraction = last === 0 ? 0 : index / last;

  const pick = useCallback(
    (clientY) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      const next = Math.round(f * last);
      if (depths[next] !== depth) onDepth(depths[next]);
    },
    [depths, depth, onDepth, last],
  );

  useEffect(() => {
    if (!dragging.current) return undefined;
    const move = (e) => pick(e.clientY);
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      onDepth(depths[Math.min(last, index + 1)]);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      onDepth(depths[Math.max(0, index - 1)]);
    } else if (e.key === "Home") {
      e.preventDefault();
      onDepth(depths[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      onDepth(depths[last]);
    }
  };

  return (
    <div className="depth-slider">
      <div
        ref={trackRef}
        className="depth-track"
        role="slider"
        tabIndex={0}
        aria-label="Depth"
        aria-valuemin={depths[0]}
        aria-valuemax={depths[last]}
        aria-valuenow={depth}
        aria-valuetext={`${depth} metres`}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.focus();
          pick(e.clientY);
        }}
      >
        <span className="depth-track-line" aria-hidden="true" />
        {/* Ticks share the same fractions as the handle, so they always line up. */}
        {depths.map((d, i) => (
          <span
            key={d}
            className={`depth-tick${i === index ? " on" : ""}`}
            style={{ top: `${(i / last) * 100}%` }}
            aria-hidden="true"
          />
        ))}
        <span className="depth-handle" style={{ top: `${fraction * 100}%` }} aria-hidden="true" />
      </div>

      <ul className="depth-labels">
        {depths.map((d, i) => (
          <li key={d} style={{ top: `${(i / last) * 100}%` }}>
            <button
              className={i === index ? "depth-label on" : "depth-label"}
              onClick={() => onDepth(d)}
              aria-pressed={i === index}
            >
              {d} m
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

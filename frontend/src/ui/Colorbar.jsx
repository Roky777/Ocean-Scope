import { gradient } from "../colormaps";
import { denormalise } from "../grid";

const TICKS = 5;
const displayUnits = (units) => units === "degC" ? "°C" : units;

/** Horizontal colorbar docked at the bottom of the scene. */
export default function Colorbar({ label, units, colormap, range, context, scaleType = "linear" }) {
  const has = range && range.min != null;
  const ticks = has
    ? Array.from({ length: TICKS }, (_, i) => {
        const f = i / (TICKS - 1);
        // Ticks follow the ramp: on a log scale they are not evenly spaced in
        // value, so they must be placed through the same mapping the colours use.
        return { f, value: denormalise(f, range.min, range.max, scaleType) };
      })
    : [];

  return (
    <div className="colorbar-dock">
      <div className="colorbar-head">
        <span className="colorbar-label">
          {label} <em>({displayUnits(units)})</em>
        </span>
        <span className="colorbar-context">{context}</span>
      </div>
      <div
        className="colorbar-strip"
        style={{ background: `linear-gradient(to right, ${gradient(colormap)})` }}
      />
      <div className="colorbar-ticks">
        {ticks.map(({ f, value }) => (
          <span key={f} style={{ left: `${f * 100}%` }}>
            {value >= 100 || value === 0 ? value.toFixed(0) : value.toFixed(2)}
          </span>
        ))}
      </div>
      <div className="colorbar-words"><span>{label.toLowerCase().includes("temperature") ? "Cooler" : "Lower"}</span><span>{label.toLowerCase().includes("temperature") ? "Warmer" : "Higher"}</span></div>
      <p className="colorbar-explanation">Colors show {label.toLowerCase()}.{label.toLowerCase().includes("temperature") ? " Warm colors do not automatically mean danger." : ""}</p>
    </div>
  );
}

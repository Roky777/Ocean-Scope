import { gradient } from "../colormaps";

const TICKS = 5;

/** Horizontal colorbar docked at the bottom of the scene. */
export default function Colorbar({ label, units, colormap, range, context }) {
  const has = range && range.min != null;
  const ticks = has
    ? Array.from({ length: TICKS }, (_, i) => {
        const f = i / (TICKS - 1);
        return { f, value: range.min + f * (range.max - range.min) };
      })
    : [];

  return (
    <div className="colorbar-dock">
      <div className="colorbar-head">
        <span className="colorbar-label">
          {label} <em>({units})</em>
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
            {value.toFixed(1)}
          </span>
        ))}
      </div>
    </div>
  );
}

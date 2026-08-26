import { viridisGradient } from "../viridis";

const TICKS = 6;

/** Horizontal colorbar with numeric tick labels, as in the LAS reference. */
export default function Colorbar({ min, max, units, label }) {
  if (min == null || max == null) return <div className="colorbar-placeholder" />;

  const ticks = Array.from({ length: TICKS }, (_, i) => {
    const f = i / (TICKS - 1);
    return { f, value: min + f * (max - min) };
  });

  return (
    <div className="colorbar">
      <div className="colorbar-title">
        {label} ({units})
      </div>
      <div
        className="colorbar-bar"
        style={{ background: `linear-gradient(to right, ${viridisGradient()})` }}
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

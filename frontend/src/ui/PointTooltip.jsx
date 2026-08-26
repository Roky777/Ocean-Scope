const fmtLat = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "N" : "S"}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "E" : "W"}`;

/**
 * Transient read-out that follows the cursor over the ocean surface.
 * Reads already-loaded grid data, so it never waits on the network.
 */
export default function PointTooltip({ point, label, units }) {
  if (!point) return null;

  // Flip to the other side of the cursor near the viewport edges.
  const flipX = point.clientX > window.innerWidth - 200;
  const flipY = point.clientY > window.innerHeight - 120;

  return (
    <div
      className="point-tip"
      style={{
        left: point.clientX,
        top: point.clientY,
        transform: `translate(${flipX ? "calc(-100% - 16px)" : "16px"}, ${
          flipY ? "calc(-100% - 16px)" : "16px"
        })`,
      }}
    >
      <div className="point-tip-value">
        {point.value == null ? "no data" : `${point.value.toFixed(2)} ${units}`}
      </div>
      <div className="point-tip-meta">
        {fmtLat(point.lat)} · {fmtLon(point.lon)}
      </div>
      <div className="point-tip-hint">{label} · click to inspect</div>
    </div>
  );
}

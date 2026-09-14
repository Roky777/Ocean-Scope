const SENSOR_META = { argo: ["circle", "Argo"], glider: ["triangle", "Glider"], ctd: ["square", "CTD"], bgc: ["hexagon", "BGC"] };

export function SummaryStrip({ field, instruments, timestepCount }) {
  if (!field) return null;
  return <section className="workspace-summary" aria-label="Active data summary">
    <div><span>Active variable</span><strong>{field.label}</strong></div><div><span>Depth</span><strong>{field.surface ? "Surface" : `${field.depth} m`}</strong></div><div><span>Analysis time</span><strong>{field.month_label}</strong></div><div><span>Grid</span><strong>{field.shape.join(" × ")}</strong></div><div><span>Observations</span><strong>{instruments.length} instruments</strong></div><div><span>Sequence</span><strong>{timestepCount} months</strong></div>
  </section>;
}

export function SensorLegend({ instruments }) {
  return <section className="sensor-legend" aria-label="Instrument legend"><span>Observations</span>{Object.entries(SENSOR_META).map(([type,[shape,label]])=><div key={type}><i className={`sensor-symbol ${shape} ${type}`}/><b>{label}</b><small>{instruments.filter(x => (x.type ?? "argo") === type).length}</small></div>)}</section>;
}

export function WorkspaceTimeline({ timesteps, timestep, onTimestep, playing, onPlay }) {
  if (!timesteps?.length) return null;
  const active = timesteps[timestep];
  const exact = active?.time ? new Intl.DateTimeFormat("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:false, timeZone:"UTC" }).format(new Date(active.time)).replace(",", " ·") : active?.label;
  return <section className="workspace-timeline" aria-label="Watch ocean changes"><button className="timeline-play" onClick={onPlay} aria-label={playing ? "Pause changes" : "Watch changes"}>{playing ? "❚❚" : "▶"}</button><div><header><span>{playing ? "Watching changes" : "Drag to move through time"}</span><strong>{exact} UTC</strong></header><input aria-label="Analysis month" type="range" min="0" max={timesteps.length-1} step="1" value={timestep} onChange={e=>onTimestep(Number(e.target.value))}/></div></section>;
}

export function WorkspaceDepth({ depths, depth, onDepth, surfaceOnly }) {
  if (!depths?.length) return null;
  const index = Math.max(0, depths.indexOf(depth));
  return <section className="workspace-depth" aria-label="Ocean depth">
    <header><span>Depth</span><strong>{surfaceOnly ? "Surface only" : index === 0 ? `${depth} m · surface layer` : `${depth} m below surface`}</strong></header>
    <input aria-label="Ocean depth" type="range" min="0" max={depths.length - 1} step="1" value={index} disabled={surfaceOnly} onChange={event => onDepth(depths[Number(event.target.value)])}/>
    <footer><span>{depths[0]} m</span><span>Deeper ocean</span><span>{depths.at(-1)} m</span></footer>
  </section>;
}

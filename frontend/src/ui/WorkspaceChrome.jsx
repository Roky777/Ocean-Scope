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
  return <section className="workspace-timeline" aria-label="Choose a month"><button className="timeline-play" onClick={onPlay} aria-label={playing ? "Pause animation" : "Play the months"}>{playing ? "❚❚" : "▶"}</button><div><header><span>{playing ? "Playing months" : "Choose a month"}</span><strong>{timesteps[timestep]?.label}</strong></header><input aria-label="Month" type="range" min="0" max={timesteps.length-1} step="1" value={timestep} onChange={e=>onTimestep(Number(e.target.value))}/></div></section>;
}

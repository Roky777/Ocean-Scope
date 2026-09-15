import { useEffect, useMemo, useState } from "react";
import { fetchScienceProfile, fetchTransect } from "../api";

const fmt = (value, digits = 2) => Number.isFinite(value) ? Number(value).toFixed(digits) : "—";

function SectionPlot({ data }) {
  const width = 480, height = 230, left = 42, right = 14, top = 14, bottom = 34;
  const values = data.samples.flatMap((sample) => sample.values.filter(Number.isFinite));
  const low = Math.min(...values), high = Math.max(...values);
  const cellWidth = (width - left - right) / data.samples.length;
  const cellHeight = (height - top - bottom) / data.depths.length;
  const color = (value) => {
    if (!Number.isFinite(value)) return "#202126";
    const t = Math.max(0, Math.min(1, (value - low) / (high - low || 1)));
    const light = 20 + t * 64;
    return `hsl(${225 - t * 200} 18% ${light}%)`;
  };
  return (
    <svg className="section-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${data.variable} vertical section`}>
      {data.samples.map((sample, x) => sample.values.map((value, z) => (
        <rect key={`${x}-${z}`} x={left + x * cellWidth} y={top + z * cellHeight} width={cellWidth + .4} height={cellHeight + .4} fill={color(value)} />
      )))}
      <line x1={left} y1={height-bottom} x2={width-right} y2={height-bottom} className="section-axis" />
      <line x1={left} y1={top} x2={left} y2={height-bottom} className="section-axis" />
      {[0, Math.floor((data.depths.length-1)/2), data.depths.length-1].map((index) => <text key={index} x={left-6} y={top+(index+.7)*cellHeight} textAnchor="end">{data.depths[index]} m</text>)}
      <text x={left} y={height-9}>A · 0 km</text><text x={width-right} y={height-9} textAnchor="end">B · {fmt(data.distance_km, 0)} km</text>
      <text x={width-right} y={top+9} textAnchor="end">{fmt(high)} {data.units}</text><text x={width-right} y={height-bottom-5} textAnchor="end">{fmt(low)} {data.units}</text>
    </svg>
  );
}

export default function ScienceLab({ bounds, timestep, time, onClose }) {
  const defaults = useMemo(() => ({
    start_lat: Math.max(bounds.lat_min, bounds.lat_min + (bounds.lat_max-bounds.lat_min)*.4),
    start_lon: Math.max(bounds.lon_min, bounds.lon_min + (bounds.lon_max-bounds.lon_min)*.18),
    end_lat: Math.min(bounds.lat_max, bounds.lat_min + (bounds.lat_max-bounds.lat_min)*.62),
    end_lon: Math.min(bounds.lon_max, bounds.lon_min + (bounds.lon_max-bounds.lon_min)*.82),
  }), [bounds]);
  const [tab, setTab] = useState("section");
  const [form, setForm] = useState({ ...defaults, variable: "temperature", samples: 36 });
  const [section, setSection] = useState(null);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const loadSection = async (event) => {
    event?.preventDefault(); setStatus("loading"); setError("");
    try { setSection(await fetchTransect({ ...form, timestep })); setStatus("ready"); }
    catch (e) { setError(e.message); setStatus("error"); }
  };

  useEffect(() => { loadSection(); }, [timestep]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadProfile = async () => {
    setStatus("loading"); setError("");
    const lat = (Number(form.start_lat)+Number(form.end_lat))/2;
    const lon = (Number(form.start_lon)+Number(form.end_lon))/2;
    try { setProfile(await fetchScienceProfile(lat, lon, timestep)); setStatus("ready"); }
    catch (e) { setError(e.message); setStatus("error"); }
  };

  useEffect(() => { if (tab === "profile" && !profile) loadProfile(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <aside className="science-lab" aria-label="Scientific analysis lab">
      <header><div><span>SCIENTIFIC WORKSPACE</span><h2>Section Lab</h2><p>{time?.label} · real analysis</p></div><button onClick={onClose} aria-label="Close Section Lab">×</button></header>
      <nav><button className={tab === "section" ? "active" : ""} onClick={() => setTab("section")}>Transect</button><button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>TEOS-10</button></nav>
      {tab === "section" && <>
        <p className="science-intro">Sample a vertical A→B section through the active 4D field. Missing water remains missing.</p>
        <form className="transect-form" onSubmit={loadSection}>
          <fieldset><legend>A · START</legend><label>Latitude<input type="number" step=".1" min={bounds.lat_min} max={bounds.lat_max} value={form.start_lat} onChange={(e) => update("start_lat", Number(e.target.value))}/></label><label>Longitude<input type="number" step=".1" min={bounds.lon_min} max={bounds.lon_max} value={form.start_lon} onChange={(e) => update("start_lon", Number(e.target.value))}/></label></fieldset>
          <fieldset><legend>B · END</legend><label>Latitude<input type="number" step=".1" min={bounds.lat_min} max={bounds.lat_max} value={form.end_lat} onChange={(e) => update("end_lat", Number(e.target.value))}/></label><label>Longitude<input type="number" step=".1" min={bounds.lon_min} max={bounds.lon_max} value={form.end_lon} onChange={(e) => update("end_lon", Number(e.target.value))}/></label></fieldset>
          <label className="section-variable">Section variable<select value={form.variable} onChange={(e) => update("variable", e.target.value)}><option value="temperature">Temperature</option><option value="salinity">Salinity</option><option value="sigma0">Potential density σ₀</option></select></label>
          <button type="submit">Update section</button>
        </form>
        {status === "loading" && <p className="science-status">Sampling the water column…</p>}
        {section && status !== "loading" && <><SectionPlot data={section}/><dl className="section-facts"><div><dt>Length</dt><dd>{fmt(section.distance_km, 0)} km</dd></div><div><dt>Samples</dt><dd>{section.samples.length} × {section.depths.length}</dd></div><div><dt>Method</dt><dd>{section.spatial_methods.join(", ").replaceAll("_", " ")}</dd></div></dl></>}
      </>}
      {tab === "profile" && <>
        <p className="science-intro">TEOS-10 diagnostics at the midpoint of the current transect.</p>
        {!profile && status === "loading" && <p className="science-status">Calculating Absolute Salinity, Conservative Temperature and density…</p>}
        {profile && <><div className="diagnostic-hero"><div><span>Mixed layer</span><strong>{fmt(profile.mixed_layer_depth_m, 0)} m</strong></div><div><span>Thermocline</span><strong>{fmt(profile.thermocline_depth_m, 0)} m</strong></div></div><table className="teos-table"><thead><tr><th>Depth</th><th>CT</th><th>SA</th><th>σ₀</th></tr></thead><tbody>{profile.profile.map((row) => <tr key={row.depth}><td>{row.depth} m</td><td>{fmt(row.conservative_temperature)}</td><td>{fmt(row.absolute_salinity)}</td><td>{fmt(row.sigma0)}</td></tr>)}</tbody></table><details className="science-method"><summary>Method and provenance</summary><p>{profile.method}. {profile.mld_method}.</p><code>{profile.provenance.dataset_id} · {profile.provenance.valid_time}</code></details></>}
      </>}
      {error && <p className="evidence-error">{error}</p>}
    </aside>
  );
}

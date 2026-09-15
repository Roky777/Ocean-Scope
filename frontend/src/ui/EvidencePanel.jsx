import { useMemo, useState } from "react";
import { collocateEvidence, searchEvidence } from "../api";

const W = 330;
const H = 280;
const PAD = { top: 16, right: 14, bottom: 38, left: 48 };
const fmtCoord = (value, positive, negative) => `${Math.abs(value).toFixed(2)}° ${value >= 0 ? positive : negative}`;
const fmtHours = (hours) => hours < 48 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} days`;
const displayUnits = (units) => units === "degC" ? "°C" : units === "psu" ? "PSU" : units;
const oceanRegion = ({ lat, lon }) => {
  if (lon >= 92 && lat <= 16) return "Andaman Sea";
  if (lon >= 80) return "Bay of Bengal";
  if (lon <= 77) return "Arabian Sea";
  return lat < 8 ? "Indian Ocean south of India" : "Waters around southern India";
};
const localTime = (value) => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date(value)) : "Time unavailable";

function MatchChart({ result, label }) {
  const rows = result.profile;
  const values = rows.flatMap((row) => [row.observed, row.model]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const d0 = Math.min(...rows.map((row) => row.depth));
  const d1 = Math.max(...rows.map((row) => row.depth));
  const x = (value) => PAD.left + ((value - lo) / (hi - lo || 1)) * (W - PAD.left - PAD.right);
  const y = (depth) => PAD.top + ((depth - d0) / (d1 - d0 || 1)) * (H - PAD.top - PAD.bottom);
  const path = (key) => rows.map((row, i) => `${i ? "L" : "M"}${x(row[key]).toFixed(1)},${y(row.depth).toFixed(1)}`).join("");
  const depthTicks = [d0, (d0 + d1) / 2, d1];
  const valueTicks = [lo, (lo + hi) / 2, hi];
  return (
    <>
      <svg className="profile-chart evidence-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Observed and model ${label} by depth`}>
        {depthTicks.map((depth, index) => <g key={index}><line x1={PAD.left} x2={W - PAD.right} y1={y(depth)} y2={y(depth)} className="grid-line"/><text x={PAD.left - 8} y={y(depth) + 4} textAnchor="end" className="axis-text">{depth.toFixed(0)}</text></g>)}
        {valueTicks.map((value, index) => <text key={index} x={x(value)} y={H - 16} textAnchor="middle" className="axis-text">{value.toFixed(1)}</text>)}
        <path d={path("observed")} className="profile-line argo"/>
        <path d={path("model")} className="profile-line model"/>
        <text x={Math.min(W - 92, x(rows[0].observed) + 5)} y={y(rows[0].depth) + 11} className="curve-label observed">Argo measurement</text>
        <text x={Math.min(W - 55, x(rows[0].model) + 5)} y={y(rows[0].depth) - 5} className="curve-label model">Model</text>
        <text x={PAD.left - 34} y={(PAD.top + H - PAD.bottom) / 2} className="axis-title" textAnchor="middle" transform={`rotate(-90 ${PAD.left - 34} ${(PAD.top + H - PAD.bottom) / 2})`}>Depth (m)</text>
        <text x={(PAD.left + W - PAD.right) / 2} y={H - 2} className="axis-title" textAnchor="middle">{label} ({displayUnits(result.units)})</text>
      </svg>
      <ul className="legend-list"><li><span className="swatch-line argo"/>Argo measurement</li><li><span className="swatch-line model"/>Model</li></ul>
    </>
  );
}

const matchLabel = (candidate) => candidate.match_score >= 0.72 ? "Strong match" : candidate.match_score >= 0.5 ? "Useful match" : "Limited match";

const comparisonSummary = (comparison) => {
  const correlation = comparison.metrics.correlation;
  const shape = correlation >= 0.8 ? "Both profiles show a similar overall pattern." : correlation >= 0.5 ? "The profiles share part of the same pattern." : "The profile shapes differ across the matched depths.";
  const bias = comparison.metrics.bias;
  const unit = displayUnits(comparison.units);
  const direction = bias > 0.05 ? `The model is ${Math.abs(bias).toFixed(2)} ${unit} warmer on average.` : bias < -0.05 ? `The model is ${Math.abs(bias).toFixed(2)} ${unit} cooler on average.` : "Their average values are closely aligned.";
  const largest = comparison.profile.reduce((best, row) => Math.abs(row.difference) > Math.abs(best.difference) ? row : best, comparison.profile[0]);
  return `${shape} ${direction} The largest difference is near ${Math.round(largest.depth)} m.`;
};

export default function EvidencePanel({ point, variable, label, units, source, dataset, timestep, time, depths, range, closing, onClose, onCandidates, onSelected, onAnalyze, onNearestValid, onChooseDepth }) {
  const supported = variable === "temperature" || variable === "salinity";
  const maxDepth = depths.at(-1);
  const initialRange = useMemo(() => {
    const center = Number(point?.depth ?? depths[0]);
    return [Math.max(depths[0], center - 50), Math.min(maxDepth, center + 100)];
  }, [point, depths, maxDepth]);
  const [radius, setRadius] = useState(250);
  const [hours, setHours] = useState(1080);
  const [depthRange, setDepthRange] = useState(initialRange);
  const [state, setState] = useState("overview");
  const [result, setResult] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [error, setError] = useState(null);

  const runSearch = async () => {
    setState("searching"); setError(null); setComparison(null); onSelected(null);
    try {
      const data = await searchEvidence({
        dataset: "incois_argo_mnt_VAM", variable, lat: point.lat, lon: point.lon,
        depth_min: Number(depthRange[0]), depth_max: Number(depthRange[1]), timestep,
        radius_km: Number(radius), time_window_hours: Number(hours), minimum_depth_overlap_ratio: 0.3,
      });
      setResult(data); setState("candidates"); onCandidates(data.candidates);
    } catch (e) { setError(e.message); setState("selection"); }
  };

  const compare = async (candidate) => {
    setState("comparing"); setSelectedCandidate(candidate); setError(null); onSelected(candidate);
    try {
      const data = await collocateEvidence({ dataset: "incois_argo_mnt_VAM", variable, observation_id: candidate.id, timestep });
      setComparison(data); setState("comparison");
    } catch (e) { setError(e.message); setState("candidates"); onSelected(null); }
  };

  if (!point) return null;
  return (
    <aside className={`evidence-panel${closing ? " closing" : ""}`} role="dialog" aria-label="Feature to observational evidence">
      <header className="evidence-head"><div><span className="evidence-kicker">Selected location</span><h2>{oceanRegion(point)}</h2><p>{fmtCoord(point.lat, "N", "S")} · {fmtCoord(point.lon, "E", "W")}</p></div><button className="icon-button" onClick={onClose} aria-label="Close selected water panel">×</button></header>

      {!comparison && point.value != null && <section className="selected-feature"><dl><div><dt>Time</dt><dd>{localTime(time?.time)} IST<small>{time?.time?.replace("Z", "")} UTC</small></dd></div><div><dt>Depth</dt><dd>~{point.depth} metres below surface</dd></div><div><dt>{label}</dt><dd className="selected-value">{point.value.toFixed(2)} {displayUnits(units)}</dd></div></dl></section>}

      {state === "overview" && <>
        {point.value == null ? <section className="invalid-selection"><h3>No ocean data at this exact point</h3><p>The selected location falls outside the valid model grid at this depth.</p><button className="evidence-primary" onClick={onNearestValid}>Move to nearest valid ocean point</button><button onClick={onChooseDepth}>Choose another depth</button></section> : <>
          <p className="selection-meaning">{point.value > range.max - (range.max - range.min) * 0.35 ? `Warmer than nearby water at the same depth.` : point.value < range.min + (range.max - range.min) * 0.35 ? `Cooler than nearby water at the same depth.` : `Near the middle of the visible range at this depth.`}</p>
          <button className="evidence-primary evidence-cta" disabled={!supported} onClick={runSearch}>Check with real measurements <span>→</span></button>
          {!supported && <p className="evidence-error">Real-measurement comparison currently supports depth-resolved temperature and salinity. Choose one of those variables to continue.</p>}
          <div className="context-accordions"><details open><summary>What does this mean?</summary><p>You are looking at {label.toLowerCase()} about {point.depth} metres below the {oceanRegion(point)}. This value is compared with nearby water at the same depth.</p></details><details><summary>Why is this interesting?</summary><p>{variable === "temperature" ? "Warm subsurface water can influence currents, marine ecosystems and weather processes." : "Changes here help scientists understand how this part of the ocean behaves."}</p></details><details><summary>Data source</summary><p>{source}</p><code>{dataset} · {variable}</code></details><details><summary>Share this view</summary><button onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copy view link</button></details></div>
          <button className="analyze-link" onClick={onAnalyze}>Open scientific controls</button>
        </>}
      </>}

      {state === "explain" && <section className="explain-selection"><button className="evidence-back" onClick={() => setState("overview")}>← What you selected</button><h3>What you’re seeing</h3><p>You are looking at {label.toLowerCase()} about {point.depth} metres below the surface. The color legend shows how this value compares with the rest of the visible ocean.</p>{variable === "temperature" && <><h3>Why temperature changes with depth</h3><p>Sunlight heats the upper ocean most strongly. Deeper water receives much less direct heating, so temperature usually decreases with depth.</p><details><summary>What is a thermocline?</summary><p>A thermocline is a layer where temperature changes quickly as you move deeper.</p></details></>}<button className="evidence-primary" onClick={runSearch}>Check with Real Measurements</button></section>}

      {state === "selection" && <>
        <p className="evidence-intro">Search farther when no suitable instrument measured this exact place and time. A wider search may be less representative of the selected water.</p>
        <div className="evidence-search-grid"><label>Radius <span>{radius} km</span><input type="range" min="100" max="1000" step="50" value={radius} onChange={(e) => setRadius(Number(e.target.value))}/></label><label>Time window <span>±{Math.round(hours / 24)} days</span><input type="range" min="24" max="2160" step="24" value={hours} onChange={(e) => setHours(Number(e.target.value))}/></label><label>Depth from <input type="number" min={depths[0]} max={depthRange[1] - 1} value={depthRange[0]} onChange={(e) => setDepthRange([Number(e.target.value), depthRange[1]])}/></label><label>Depth to <input type="number" min={depthRange[0] + 1} max={maxDepth} value={depthRange[1]} onChange={(e) => setDepthRange([depthRange[0], Number(e.target.value)])}/></label></div>
        <button className="evidence-primary" disabled={!supported} onClick={runSearch}>Search with these settings</button>
      </>}

      {state === "searching" && <div className="evidence-loading"><span className="mini-spinner"/><strong>Finding nearby ocean instruments…</strong><ul><li>Checking measurement quality</li><li>Checking measurement time</li><li>Checking measured depths</li></ul></div>}
      {result && state === "candidates" && <>
        <div className="evidence-results-head"><div><strong>{result.count} useful measurement{result.count === 1 ? "" : "s"} found</strong><span>Closest and most relevant appear first</span></div><button onClick={() => { setState("selection"); onCandidates([]); }}>Search settings</button></div>
        {!result.count && <div className="no-evidence"><strong>No suitable real measurement was found nearby</strong><p>Ocean instruments cannot measure every place at every moment. Searching farther may find context, but it may represent this feature less accurately.</p><button className="evidence-primary" onClick={() => { setRadius(Math.min(1000, radius * 2)); setHours(Math.min(2160, hours * 2)); setState("selection"); }}>Search farther away</button></div>}
        <div className="candidate-list">{result.candidates.map((candidate, index) => <article className="candidate-card" key={candidate.id}><header><span>{index === 0 ? "BEST NEARBY MEASUREMENT" : `MEASUREMENT ${index + 1}`}</span><strong>Argo Float {candidate.platform_id}</strong><em>{matchLabel(candidate)}</em></header><ul className="match-reasons"><li>Measurement quality: {candidate.qc_summary.rejected ? "some values excluded" : "good"}</li><li>About {candidate.distance_km} km away</li><li>About {fmtHours(candidate.time_gap_hours)} {new Date(candidate.time) > new Date(result.selection.model_time) ? "later" : "earlier"}</li><li>Covered {Math.round(candidate.depth_overlap_ratio * 100)}% of the selected depths</li></ul><details><summary>Technical details</summary><dl><div><dt>Cycle</dt><dd>{candidate.cycle_id ?? "—"}</dd></div><div><dt>Valid depths</dt><dd>{candidate.valid_levels}</dd></div><div><dt>QC accepted</dt><dd>{candidate.qc_summary.good + candidate.qc_summary.probably_good}/{candidate.valid_levels + candidate.qc_summary.rejected}</dd></div><div><dt>Match ranking</dt><dd>{candidate.match_score.toFixed(3)}</dd></div></dl></details><button onClick={() => compare(candidate)}>Compare prediction and measurement</button></article>)}</div>
        {result.count > 0 && <p className="score-note">Match quality describes location, time, depth coverage and measurement quality. It does not say whether the model is correct.</p>}
      </>}

      {state === "comparing" && <div className="evidence-loading"><span className="mini-spinner"/><strong>Preparing a fair comparison…</strong><p>Aligning the model and measurement in location, time and depth.</p></div>}
      {comparison && state === "comparison" && <>
        <button className="evidence-back" onClick={() => { setComparison(null); setSelectedCandidate(null); setState("candidates"); onSelected(null); }}>← Candidate observations</button>
        <section className="match-identity"><span>{(comparison.observation.type ?? "argo").toUpperCase()} FLOAT</span><h3>{comparison.observation.platform_number}{comparison.observation.cycle_number != null ? ` · Cycle ${comparison.observation.cycle_number}` : ""}</h3><p>{comparison.observation.time.replace("T", " · ").replace("Z", " UTC")}</p></section>
        <div className={`confidence-card ${comparison.comparison_confidence?.label ?? "limited"}`}><span>COMPARISON CONFIDENCE</span><strong>{comparison.comparison_confidence?.label ?? "Unavailable"}</strong><em>{Math.round((comparison.comparison_confidence?.score ?? 0) * 100)} / 100</em><p>This rates how representative the matchup is. It does not rate model accuracy.</p></div>
        <dl className="match-context"><div><dt>Feature distance</dt><dd>{selectedCandidate?.distance_km} km</dd></div><div><dt>Grid footprint</dt><dd>{comparison.representativeness?.grid_footprint_km ?? comparison.spatial_distance_km} km</dd></div><div><dt>Time matching</dt><dd>{comparison.time_matching.method === "linear_time_interpolation" ? "Linear interpolation" : "Nearest timestep"}</dd></div><div><dt>Common depth</dt><dd>{comparison.depth_matching.common_depth_range.join("–")} m</dd></div><div><dt>Matched levels</dt><dd>{comparison.depth_matching.valid_matched_depths}</dd></div></dl>
        <h3 className="comparison-title">Prediction vs Measurement</h3><p className="comparison-subtitle">How {label.toLowerCase()} changes with depth</p><p className="comparison-summary">{comparisonSummary(comparison)}</p><MatchChart result={comparison} label={label}/>
        <details className="scientific-results"><summary>Scientific details and 95% CI</summary><dl className="metric-grid"><div title="Overall difference between paired values; smaller means closer in this scientific context"><dt>RMSE</dt><dd>{comparison.metrics.rmse} {displayUnits(comparison.units)}<small>{comparison.metrics.confidence_intervals_95?.rmse?.join(" to ")}</small></dd></div><div title="Average model minus measurement"><dt>Mean bias</dt><dd>{comparison.metrics.bias > 0 ? "+" : ""}{comparison.metrics.bias} {displayUnits(comparison.units)}<small>{comparison.metrics.confidence_intervals_95?.bias?.join(" to ")}</small></dd></div><div title="Average absolute difference"><dt>MAE</dt><dd>{comparison.metrics.mae} {displayUnits(comparison.units)}<small>{comparison.metrics.confidence_intervals_95?.mae?.join(" to ")}</small></dd></div><div title="Depths where both profiles had valid values"><dt>Matched</dt><dd>{comparison.metrics.matched_samples} depths</dd></div></dl><p>Intervals use a deterministic paired bootstrap when at least four depths match. They describe sampling variability within this profile.</p></details>
        <details className="match-method"><summary>How was this matched?</summary><ol className="provenance-trail">{comparison.provenance_trail?.map((step) => <li key={step.step}><b>{step.step}</b><span><strong>{step.action}</strong>{step.detail}</span></li>)}</ol><code>{comparison.provenance?.dataset_id} · {comparison.provenance?.valid_time}</code></details>
      </>}
      {error && <p className="evidence-error">{error}</p>}
    </aside>
  );
}

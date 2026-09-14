export default function ContextPlaceholder({ field }) {
  return <aside className="context-notebook empty" aria-label="Selected location">
    <header><span>SELECTED LOCATION</span><i aria-hidden="true"/></header>
    <div className="context-empty-mark" aria-hidden="true"><span/><span/></div>
    <h2>Select water to investigate</h2>
    <p>Choose a point in the ocean to see its value, depth and location.</p>
    <ol><li><b>1</b><span>Click the coloured ocean surface</span></li><li><b>2</b><span>Read what the value means</span></li><li><b>3</b><span>Check it against a real measurement</span></li></ol>
    <footer><span>ACTIVE LAYER</span><strong>{field?.label ?? "Ocean data"}</strong><small>{field?.depth ?? "—"} m · {field?.month_label ?? "—"}</small></footer>
  </aside>;
}

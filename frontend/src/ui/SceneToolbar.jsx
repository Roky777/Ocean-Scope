const tools = [
  { id: "2d", label: "2D", icon: <><rect x="4" y="5" width="16" height="14" rx="1"/><path d="m7 15 3-3 3 2 4-5"/></> },
  { id: "3d", label: "3D", icon: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></> },
  { id: "slice", label: "Slice", icon: <><path d="M4 6h16M4 12h16M4 18h16"/><path d="m9 3 6 18"/></> },
  { id: "isosurface", label: "Same value", icon: <><path d="M4 16c3-6 5-8 8-8s5 2 8 8"/><path d="M6 18h12M9 5h6"/></> },
  { id: "measure", label: "Measure", icon: <><path d="m5 18 13-13 2 2L7 20 5 18Z"/><path d="m11 12 2 2m1-5 2 2"/></> },
];

export default function SceneToolbar({ active, onTool }) {
  return <nav className="scene-toolbar" aria-label="Ocean view tools">{tools.map(tool => <button key={tool.id} className={active === tool.id ? "active" : ""} onClick={() => onTool(tool.id)} title={tool.id === "slice" ? "Cut through the ocean (vertical section)" : tool.id === "isosurface" ? "Show water at the same value" : tool.label} aria-pressed={active === tool.id}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{tool.icon}</svg><span>{tool.label}</span></button>)}</nav>;
}

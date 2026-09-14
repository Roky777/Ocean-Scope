const EXPLANATIONS = {
  temperature: {
    title: "What is ocean temperature?",
    text: "Ocean temperature shows how heat is stored and moved through the sea. Sunlight warms the surface, while deeper layers are usually cooler.",
    why: "Temperature helps shape currents, marine habitats and the energy available to weather systems.",
  },
  salinity: {
    title: "What is salinity?",
    text: "Salinity describes how much dissolved salt is in seawater. Rain, evaporation, rivers and currents all change it.",
    why: "Along with temperature, salinity changes water density and helps drive ocean circulation.",
  },
  current_speed: {
    title: "What are ocean currents?",
    text: "Ocean currents are moving seawater. Their direction and speed transport heat, nutrients and floating material.",
    why: "Currents connect distant parts of the ocean and influence coasts, ecosystems and navigation.",
  },
  chlorophyll: {
    title: "What is chlorophyll?",
    text: "Chlorophyll is a pigment used by microscopic ocean plants. Satellites can estimate its concentration near the surface.",
    why: "It helps reveal where the base of the marine food web is more concentrated.",
  },
};

export default function ModePanel({ mode, variable, onClose, onGuide }) {
  if (mode === "understand") {
    const content = EXPLANATIONS[variable] ?? EXPLANATIONS.temperature;
    return <aside className="mode-panel understand-panel" aria-label="Understand the current ocean view">
      <header><span>UNDERSTAND</span><button onClick={onClose} aria-label="Close explanation">×</button></header>
      <h2>{content.title}</h2><p>{content.text}</p>
      <div className="depth-diagram" aria-label="Simple diagram showing surface water above deeper water"><span>Sunlit surface</span><i/><span>Deeper water</span></div>
      <details><summary>Why is this interesting?</summary><p>{content.why}</p></details>
      <details><summary>Why does depth matter?</summary><p>The ocean changes vertically as light, heat and pressure change. The display stretches depth so these thin layers remain visible; the scientific values stay unchanged.</p></details>
    </aside>;
  }
  if (mode === "learn") return <aside className="mode-panel learn-panel" aria-label="Learn ocean science">
    <header><span>LEARN WITH THE LIVE OCEAN</span><button onClick={onClose} aria-label="Close learning panel">×</button></header>
    <h2>Ocean science, connected to what you see</h2>
    <p>Select a topic, then use the live scene to see the idea in place.</p>
    <section><b>Ocean basics</b><span>Temperature · Salinity · Currents · Chlorophyll · Thermocline</span></section>
    <section><b>Measuring the ocean</b><span>Argo floats · Gliders · CTD · Buoys · HF radar</span></section>
    <section><b>Ocean models</b><span>Prediction · Measurement · Assimilation · Validation</span></section>
    <button className="mode-primary" onClick={onGuide}>Take the two-minute guided tour</button>
  </aside>;
  return null;
}

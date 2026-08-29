const FEATURES = [
  ["◉", "3D model fields", "Explore temperature, salinity, currents and chlorophyll through depth and time."],
  ["⌖", "In-situ observations", "Inspect real Argo, BGC-Argo and OceanGliders profiles beside the model."],
  ["△", "Decision support", "Review transparent heat-potential and anomaly indicators with clear scientific limits."],
  ["▤", "Open data standards", "CF-NetCDF ingestion, REST access and basic OGC WMS/WCS interoperability."],
];

export default function PortalLanding({ onLaunch, onAbout }) {
  return (
    <div className="portal" id="top">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="portal-gov">
        <div className="gov-identity"><span className="india-flag" aria-hidden="true" /><span><b>भारत सरकार</b><small>Government of India</small></span></div>
        <div className="gov-ministry"><b>पृथ्वी विज्ञान मंत्रालय</b><small>Ministry of Earth Sciences</small></div>
        <div className="gov-utilities"><button title="Language">हिं / EN</button><button title="Accessibility information">Accessibility</button><button title="Help">Help</button></div>
      </header>
      <nav className="portal-nav" aria-label="Primary navigation">
        <a className="portal-brand" href="#top"><span className="portal-seal" aria-hidden="true">IN</span><span><b>INCOIS OceanScope</b><small>3D Ocean Data Visualization System</small></span></a>
        <div className="portal-links"><a href="#capabilities">Capabilities</a><a href="#uses">Operational uses</a><button onClick={onAbout}>Data sources</button><button onClick={onLaunch} className="portal-launch-small">Launch viewer</button></div>
      </nav>
      <main id="main-content">
        <section className="portal-hero">
          <div className="portal-hero-ocean" aria-hidden="true"><div className="hero-grid"/><div className="hero-glow"/></div>
          <div className="portal-hero-copy">
            <span className="portal-kicker">Integrated ocean intelligence for India’s EEZ</span>
            <h1>Understand the ocean<br/>from surface to depth.</h1>
            <p>One browser-native workspace for model fields, instrument observations, profiles, currents and time-resolved 3D analysis.</p>
            <div className="portal-actions"><button onClick={onLaunch}>Launch 3D Viewer <span>→</span></button><button className="portal-secondary" onClick={onAbout}>View datasets</button></div>
            <dl className="portal-facts"><div><dt>4</dt><dd>model variables</dd></div><div><dt>5</dt><dd>depth levels</dd></div><div><dt>14</dt><dd>real instruments</dd></div><div><dt>12</dt><dd>monthly steps</dd></div></dl>
          </div>
        </section>
        <section className="portal-section" id="capabilities"><span className="portal-eyebrow">Platform capabilities</span><h2>From complex datasets to operational understanding</h2><div className="portal-feature-grid">{FEATURES.map(([icon,title,copy])=><article key={title}><span>{icon}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
        <section className="portal-use" id="uses"><div><span className="portal-eyebrow">Built for operational and public use</span><h2>A shared view for forecasters, researchers and citizens</h2></div><ul><li>Cyclone heat assessment</li><li>Search-and-rescue context</li><li>Fishery and marine advisories</li><li>Climate monitoring</li><li>Education and public outreach</li></ul></section>
      </main>
      <footer className="portal-footer"><div><b>OceanScope</b><span>Prototype decision-support platform for INCOIS · Ministry of Earth Sciences</span></div><div><span>Data provenance documented</span><span>Not an official warning service</span><span>Last reviewed: August 2026</span></div></footer>
    </div>
  );
}

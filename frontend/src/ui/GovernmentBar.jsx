export default function GovernmentBar({ contrast, onContrast, reducedMotion, onReducedMotion, onHome }) {
  return <div className="workspace-govbar">
    <a className="skip-link" href="#ocean-workspace">Skip to visualization</a>
    <div className="workspace-gov-id"><span className="india-flag" aria-hidden="true"/><span>भारत सरकार · Government of India</span><i/> <span>Ministry of Earth Sciences · INCOIS</span></div>
    <div className="workspace-gov-actions"><span className="service-state"><i/> Services operational</span><button onClick={onReducedMotion} aria-pressed={reducedMotion}>Reduce motion</button><button onClick={onContrast} aria-pressed={contrast}>High contrast</button><button onClick={onHome}>Portal home</button></div>
  </div>;
}

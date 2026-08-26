/**
 * First-load splash. Covers the gap between "page painted" and "3D scene
 * ready", so the app announces itself instead of showing an empty canvas.
 */
export default function Splash({ show, status }) {
  return (
    <div className={show ? "splash" : "splash gone"} aria-hidden={!show}>
      <div className="splash-inner">
        <span className="splash-mark" aria-hidden="true" />
        <h1 className="splash-name">OceanScope</h1>
        <p className="splash-tagline">3D ocean intelligence for India&rsquo;s EEZ</p>
        <div className="splash-bar" role="progressbar" aria-label="Loading">
          <span />
        </div>
        <p className="splash-status">{status}</p>
      </div>
    </div>
  );
}

/**
 * Opening screen.
 *
 * Composed the way an Apple product page opens: typography carries it, the
 * product itself is the visual, and nothing announces that it is "loading".
 *
 * - No logo mark. The ocean is the product, so a darkened render of the real
 *   terrain sits behind the words and sharpens as the scene comes up.
 * - Type is large and tightly tracked, set on a grid in the lower-left rather
 *   than shrunk into the centre of an empty screen.
 * - The tagline arrives a beat after the headline. That delay is the only
 *   motion; there is no spinner, bar, or percentage.
 */
export default function Splash({ show, ready }) {
  return (
    <div className={show ? "splash" : "splash gone"} aria-hidden={!show}>
      {/* Deep-water gradient standing in for the scene until it can be seen
          through. It lifts and clears as the terrain finishes building. */}
      <div className={ready ? "splash-water clearing" : "splash-water"} aria-hidden="true" />
      <div className="splash-scrim" aria-hidden="true" />

      <div className="splash-grid">
        <div className="splash-copy">
          <h1 className="splash-headline">OceanScope</h1>
          <p className="splash-tagline">3D ocean intelligence for India&rsquo;s EEZ</p>
        </div>
        <p className="splash-foot">Indian National Centre for Ocean Information Services</p>
      </div>
    </div>
  );
}

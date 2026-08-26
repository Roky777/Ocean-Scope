// Sequential "cold -> warm" colormap (turbo-like): deep blue -> cyan -> green
// -> yellow -> red. Anchors are [stop, r, g, b] with channels in 0..1.
const ANCHORS = [
  [0.0, 0.19, 0.21, 0.58],
  [0.25, 0.13, 0.56, 0.82],
  [0.5, 0.24, 0.78, 0.55],
  [0.7, 0.85, 0.86, 0.28],
  [0.87, 0.94, 0.55, 0.18],
  [1.0, 0.78, 0.15, 0.15],
];

/** Map a normalised value (0..1) to [r, g, b] in 0..1. */
export function colormap(t) {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [s0, r0, g0, b0] = ANCHORS[i];
    const [s1, r1, g1, b1] = ANCHORS[i + 1];
    if (x <= s1) {
      const f = (x - s0) / (s1 - s0);
      return [r0 + f * (r1 - r0), g0 + f * (g1 - g0), b0 + f * (b1 - b0)];
    }
  }
  const last = ANCHORS[ANCHORS.length - 1];
  return [last[1], last[2], last[3]];
}

/** Same, as a CSS rgb() string. */
export function colormapCSS(t) {
  const [r, g, b] = colormap(t);
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

export const normalise = (v, min, max) => (max === min ? 0.5 : (v - min) / (max - min));

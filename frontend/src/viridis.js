// Viridis colormap (matplotlib), sampled at 11 stops and linearly interpolated.
// Dark purple (cold) -> blue -> teal -> green -> yellow (warm), matching the
// INCOIS LAS reference rendering.
const STOPS = [
  [68, 1, 84],
  [72, 40, 120],
  [62, 74, 137],
  [49, 104, 142],
  [38, 130, 142],
  [31, 158, 137],
  [53, 183, 121],
  [109, 205, 89],
  [180, 222, 44],
  [216, 226, 25],
  [253, 231, 37],
];

/** Normalised value (0..1) -> [r, g, b] in 0..255. */
export function viridis(t) {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const pos = x * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  return [
    a[0] + f * (b[0] - a[0]),
    a[1] + f * (b[1] - a[1]),
    a[2] + f * (b[2] - a[2]),
  ];
}

export function viridisCSS(t) {
  const [r, g, b] = viridis(t);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** CSS gradient string for the colorbar. */
export function viridisGradient(steps = 12) {
  return Array.from({ length: steps }, (_, i) => viridisCSS(i / (steps - 1))).join(", ");
}

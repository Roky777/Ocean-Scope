/**
 * Colormaps for the ocean scene.
 *
 * `thermal` and `haline` follow the cmocean family used by real ocean-viz
 * tools: perceptually ordered, dark at the low end so the terrain reads as
 * depth, bright at the high end. Stops are [r, g, b] in 0..255.
 */
const MAPS = {
  // Deep blue/black -> purple -> red -> orange -> pale yellow.
  thermal: [
    [3, 35, 51],
    [13, 48, 100],
    [50, 56, 148],
    [98, 60, 152],
    [143, 66, 138],
    [186, 78, 110],
    [219, 100, 80],
    [238, 131, 55],
    [246, 168, 39],
    [246, 208, 62],
    [232, 250, 145],
  ],
  // Deep purple -> blue -> teal -> green -> pale yellow-green.
  haline: [
    [41, 24, 107],
    [42, 42, 122],
    [30, 72, 138],
    [22, 100, 138],
    [26, 126, 128],
    [45, 152, 111],
    [86, 175, 90],
    [138, 195, 73],
    [193, 210, 68],
    [235, 226, 100],
    [253, 238, 153],
  ],
  // cmocean `algae`: near-black through deep green to pale yellow-green. The
  // conventional palette for chlorophyll / productivity, and deliberately
  // unlike the temperature and salinity ramps so the variable is unmistakable.
  algae: [
    [8, 26, 20],
    [13, 47, 33],
    [17, 69, 44],
    [23, 92, 52],
    [38, 115, 55],
    [61, 137, 56],
    [90, 158, 57],
    [124, 178, 60],
    [161, 197, 71],
    [201, 214, 96],
    [233, 231, 138],
  ],
  // Hazard severity ramp for Cyclone Heat Potential: calm teal -> caution
  // amber -> alarm red. Deliberately NOT a rainbow: the eye should jump
  // straight to the red zones and nothing else should compete.
  risk: [
    [16, 48, 62],
    [22, 79, 92],
    [30, 112, 110],
    [66, 143, 106],
    [131, 167, 87],
    [196, 182, 71],
    [232, 168, 56],
    [231, 132, 47],
    [219, 92, 47],
    [196, 54, 51],
    [158, 26, 48],
  ],
  // Pale yellow -> green -> teal -> deep navy (cmocean speed, reversed).
  speed: [
    [255, 253, 205],
    [216, 234, 160],
    [161, 213, 148],
    [104, 190, 152],
    [60, 163, 158],
    [36, 133, 156],
    [37, 102, 145],
    [42, 71, 122],
    [39, 43, 92],
    [26, 21, 57],
    [10, 8, 26],
  ],
  anomaly: [
    [35, 78, 148], [54, 112, 176], [91, 151, 194], [151, 198, 211],
    [218, 233, 230], [245, 245, 238], [249, 218, 176], [238, 166, 118],
    [217, 105, 82], [174, 55, 64], [119, 31, 53],
  ],
};

export const COLORMAP_NAMES = Object.keys(MAPS);

/** Normalised value (0..1) -> [r, g, b] in 0..1 (Three.js colour space). */
export function sample(name, t) {
  const stops = MAPS[name] ?? MAPS.thermal;
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const pos = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    (a[0] + f * (b[0] - a[0])) / 255,
    (a[1] + f * (b[1] - a[1])) / 255,
    (a[2] + f * (b[2] - a[2])) / 255,
  ];
}

/** Same, as a CSS colour string. */
export function sampleCSS(name, t) {
  const [r, g, b] = sample(name, t);
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/** CSS gradient stops for a colorbar. */
export function gradient(name, steps = 14) {
  return Array.from({ length: steps }, (_, i) => sampleCSS(name, i / (steps - 1))).join(", ");
}

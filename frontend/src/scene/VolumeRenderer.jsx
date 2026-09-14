import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { sample } from "../colormaps";
import { HEIGHT, WIDTH, normalise } from "../grid";

// At the default 5× visual exaggeration the 500 m water column occupies 8.25
// world units, about 41% of the 20-unit map width: deep enough to read without
// pretending that geographic and vertical scales are equal.
const VOLUME_DEPTH = 1.65;

const vertexShader = `
  out vec3 vOrigin;
  out vec3 vDirection;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vOrigin = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    vDirection = position - vOrigin;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  precision highp float;
  precision highp sampler3D;
  in vec3 vOrigin;
  in vec3 vDirection;
  uniform sampler3D uVolume;
  uniform sampler2D uPalette;
  uniform float uOpacity;
  uniform float uDensity;
  uniform float uLow;
  uniform float uHigh;
  uniform float uClipNear;
  uniform float uClipDeep;
  uniform float uSteps;
  uniform vec3 uVoxel;
  out vec4 fragColor;

  vec2 hitBox(vec3 origin, vec3 direction) {
    vec3 inv = 1.0 / direction;
    vec3 t0 = (-0.5 - origin) * inv;
    vec3 t1 = ( 0.5 - origin) * inv;
    vec3 lo = min(t0, t1);
    vec3 hi = max(t0, t1);
    return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
  }

  float unpackValue(vec3 uvw) {
    float packed = texture(uVolume, clamp(uvw, vec3(0.0), vec3(1.0))).r;
    return packed > 0.002 ? clamp((packed * 255.0 - 1.0) / 254.0, 0.0, 1.0) : 0.0;
  }

  void main() {
    vec3 ray = normalize(vDirection);
    vec2 bounds = hitBox(vOrigin, ray);
    if (bounds.x > bounds.y) discard;
    bounds.x = max(bounds.x, 0.0);
    vec3 p = vOrigin + bounds.x * ray;
    float span = bounds.y - bounds.x;
    float stepSize = span / uSteps;
    vec4 accum = vec4(0.0);
    for (int i = 0; i < 160; i++) {
      if (float(i) >= uSteps) break;
      vec3 uvw = vec3(p.x + 0.5, 0.5 - p.z, 0.5 - p.y);
      float packed = texture(uVolume, uvw).r;
      if (packed > 0.002 && uvw.z >= uClipNear && uvw.z <= uClipDeep) {
        float value = clamp((packed * 255.0 - 1.0) / 254.0, 0.0, 1.0);
        vec3 colour = texture(uPalette, vec2(value, 0.5)).rgb;
        float window = smoothstep(uLow - 0.025, uLow + 0.025, value) * (1.0 - smoothstep(uHigh - 0.025, uHigh + 0.025, value));
        float structure = smoothstep(uLow, max(uLow + 0.02, uHigh), value);
        // Forward differences reuse the centre sample. This preserves the
        // boundary lighting with three fewer 3D texture reads per ray step.
        vec3 gradient = vec3(
          unpackValue(uvw + vec3(uVoxel.x, 0.0, 0.0)) - value,
          unpackValue(uvw + vec3(0.0, uVoxel.y, 0.0)) - value,
          unpackValue(uvw + vec3(0.0, 0.0, uVoxel.z)) - value
        );
        float boundary = clamp(length(gradient) * 3.5, 0.0, 1.0);
        vec3 normal = normalize(gradient + vec3(0.00001));
        vec3 lightDirection = normalize(vec3(-0.45, 0.72, 0.52));
        float diffuse = max(0.0, dot(normal, lightDirection));
        colour *= 0.82 + diffuse * 0.28 * boundary;
        float alphaValue = 0.009 + structure * 0.03;
        float alpha = alphaValue * (1.0 + 2.6 * boundary) * uOpacity * uDensity * window;
        accum.rgb += (1.0 - accum.a) * alpha * colour;
        accum.a += (1.0 - accum.a) * alpha;
        if (accum.a > 0.94) break;
      }
      p += ray * stepSize;
    }
    if (accum.a < 0.01) discard;
    fragColor = accum;
  }
`;

export default function VolumeRenderer({ volume, range, colormap, scaleType, opacity = 0.75, exaggeration = 1, transfer = {} }) {
  const resources = useMemo(() => {
    if (!volume) return null;
    const [nz, ny, nx] = volume.shape;
    const sourceDepths = volume.depths;
    const maxDepth = sourceDepths.at(-1);
    // The source levels are unevenly spaced in metres. Resample only for GPU
    // display so texture Z corresponds to physical depth; every new sample is
    // a linear interpolation between two real model levels.
    const textureDepth = Math.max(32, Math.min(64, nz * 10));
    const packed = new Uint8Array(nx * ny * textureDepth);
    let offset = 0;
    for (let k = 0; k < textureDepth; k++) {
      const depth = (k / (textureDepth - 1)) * maxDepth;
      let upper = sourceDepths.findIndex((value) => value >= depth);
      if (upper < 0) upper = nz - 1;
      const lower = Math.max(0, upper - 1);
      const span = sourceDepths[upper] - sourceDepths[lower];
      const mix = span > 0 ? (depth - sourceDepths[lower]) / span : 0;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const a = volume.values[lower][j][i];
          const b = volume.values[upper][j][i];
          const value = a == null || b == null ? null : a + (b - a) * mix;
          packed[offset++] = value == null
            ? 0
            : 1 + Math.round(Math.min(1, Math.max(0, normalise(value, range.min, range.max, scaleType))) * 254);
        }
      }
    }
    const texture = new THREE.Data3DTexture(packed, nx, ny, textureDepth);
    texture.format = THREE.RedFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    const colours = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = sample(colormap, i / 255);
      colours.set([r * 255, g * 255, b * 255, 255], i * 4);
    }
    const palette = new THREE.DataTexture(colours, 256, 1, THREE.RGBAFormat);
    palette.colorSpace = THREE.SRGBColorSpace;
    palette.needsUpdate = true;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uVolume: { value: texture },
        uPalette: { value: palette },
        uOpacity: { value: 0.75 },
        uDensity: { value: 1 },
        uLow: { value: 0 },
        uHigh: { value: 1 },
        uClipNear: { value: 0 },
        uClipDeep: { value: 1 },
        uSteps: { value: 64 },
        uVoxel: { value: new THREE.Vector3(1 / nx, 1 / ny, 1 / textureDepth) },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    return { texture, palette, material };
  }, [volume, range.min, range.max, colormap, scaleType]);

  useEffect(() => {
    if (!resources) return;
    const uniforms = resources.material.uniforms;
    uniforms.uOpacity.value = opacity;
    uniforms.uDensity.value = transfer.density ?? 1;
    uniforms.uLow.value = transfer.low ?? 0;
    uniforms.uHigh.value = transfer.high ?? 1;
    uniforms.uClipNear.value = transfer.clipNear ?? 0;
    uniforms.uClipDeep.value = transfer.clipDeep ?? 1;
    const lowPower = typeof navigator !== "undefined" && (
      window.innerWidth < 760 ||
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
      (navigator.deviceMemory && navigator.deviceMemory <= 4)
    );
    uniforms.uSteps.value = Math.min(transfer.quality ?? 64, lowPower ? 48 : 96);
  }, [resources, opacity, transfer]);
  useEffect(() => () => {
    resources?.texture.dispose();
    resources?.palette.dispose();
    resources?.material.dispose();
  }, [resources]);

  if (!resources) return null;
  const depth = VOLUME_DEPTH * exaggeration;
  return (
    <mesh material={resources.material} scale={[WIDTH, depth, HEIGHT]} position-y={-depth / 2 + 0.02} renderOrder={2}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

export { VOLUME_DEPTH };

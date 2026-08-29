import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { sample } from "../colormaps";
import { HEIGHT, WIDTH, normalise } from "../grid";

const VOLUME_DEPTH = 4.2;

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
  out vec4 fragColor;

  vec2 hitBox(vec3 origin, vec3 direction) {
    vec3 inv = 1.0 / direction;
    vec3 t0 = (-0.5 - origin) * inv;
    vec3 t1 = ( 0.5 - origin) * inv;
    vec3 lo = min(t0, t1);
    vec3 hi = max(t0, t1);
    return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
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
        float alpha = (0.012 + structure * 0.04) * uOpacity * uDensity * window;
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
    const packed = new Uint8Array(nx * ny * nz);
    let offset = 0;
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const value = volume.values[k][j][i];
          packed[offset++] = value == null
            ? 0
            : 1 + Math.round(Math.min(1, Math.max(0, normalise(value, range.min, range.max, scaleType))) * 254);
        }
      }
    }
    const texture = new THREE.Data3DTexture(packed, nx, ny, nz);
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
        uSteps: { value: 96 },
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
    uniforms.uSteps.value = transfer.quality ?? 96;
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

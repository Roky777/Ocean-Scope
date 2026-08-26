import { useEffect, useMemo, useRef, useState } from "react";
import { viridis } from "../viridis";

const LAND = "#dfe3e8";
const SEA_BG = "#f4f6f8";
const MIN_SCALE = 1;
const MAX_SCALE = 12;

/**
 * Bleed ocean values outward into no-data cells. Without this, bilinear
 * smoothing blends ocean colours toward transparent and leaves a bright halo
 * along every coast. The bled cells sit underneath the land polygons.
 */
function fillNoData(values, passes = 3) {
  const rows = values.length;
  const cols = values[0].length;
  let grid = values.map((row) => row.slice());

  for (let p = 0; p < passes; p++) {
    const next = grid.map((row) => row.slice());
    let changed = false;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (grid[i][j] !== null) continue;
        let sum = 0;
        let n = 0;
        for (let di = -1; di <= 1; di++) {
          for (let dj = -1; dj <= 1; dj++) {
            const a = i + di;
            const b = j + dj;
            if (a < 0 || b < 0 || a >= rows || b >= cols) continue;
            const v = grid[a][b];
            if (v !== null) {
              sum += v;
              n++;
            }
          }
        }
        if (n) {
          next[i][j] = sum / n;
          changed = true;
        }
      }
    }
    grid = next;
    if (!changed) break;
  }
  return grid;
}

/**
 * Canvas renderer for the SST grid.
 *
 * The 100x100 grid is painted once into a small offscreen canvas (one pixel
 * per cell), then drawn scaled with image smoothing on. The browser's bilinear
 * filter gives the smooth colour-filled look of a contour plot far faster than
 * computing contours in JS.
 */
export default function SstMap({ data, land, range }) {
  const canvasRef = useRef(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef(null);

  // Reset the view whenever a different region arrives.
  const boundsKey = data ? JSON.stringify(data.bounds) : "";
  useEffect(() => {
    setView({ scale: 1, x: 0, y: 0 });
  }, [boundsKey]);

  // Offscreen canvas holding one pixel per grid cell.
  const gridCanvas = useMemo(() => {
    if (!data || !range || range.min == null) return null;
    const values = fillNoData(data.values);
    const rows = values.length;
    const cols = values[0].length;

    const off = document.createElement("canvas");
    off.width = cols;
    off.height = rows;
    const ictx = off.getContext("2d");
    const img = ictx.createImageData(cols, rows);
    const span = range.max - range.min || 1;

    for (let i = 0; i < rows; i++) {
      // Grid row 0 is the southernmost latitude; canvas row 0 is the top
      // (north), so flip vertically here.
      const dst = rows - 1 - i;
      for (let j = 0; j < cols; j++) {
        const v = values[i][j];
        const p = (dst * cols + j) * 4;
        if (v === null) {
          img.data[p + 3] = 0; // enclosed no-data (e.g. inland seas)
          continue;
        }
        const [r, g, b] = viridis((v - range.min) / span);
        img.data[p] = r;
        img.data[p + 1] = g;
        img.data[p + 2] = b;
        img.data[p + 3] = 255;
      }
    }
    ictx.putImageData(img, 0, 0);
    return off;
  }, [data, range]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
      }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = SEA_BG;
      ctx.fillRect(0, 0, cssW, cssH);
      if (!data || !gridCanvas) return;

      const b = data.bounds;
      const lonSpan = b.lon_max - b.lon_min;
      const latSpan = b.lat_max - b.lat_min;

      // Equirectangular fit: preserve the lon:lat aspect inside the canvas.
      const fit = Math.min(cssW / lonSpan, cssH / latSpan);
      const mapW = lonSpan * fit;
      const mapH = latSpan * fit;
      const originX = (cssW - mapW) / 2;
      const originY = (cssH - mapH) / 2;

      ctx.save();
      ctx.translate(view.x, view.y);
      ctx.scale(view.scale, view.scale);

      // Nothing may spill outside the map frame.
      ctx.beginPath();
      ctx.rect(originX, originY, mapW, mapH);
      ctx.clip();

      ctx.fillStyle = LAND;
      ctx.fillRect(originX, originY, mapW, mapH);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(gridCanvas, originX, originY, mapW, mapH);

      // Land polygons: filled grey, stroked to give the coastline outline.
      if (land) {
        const lonToX = (lon) => originX + ((lon - b.lon_min) / lonSpan) * mapW;
        const latToY = (lat) => originY + ((b.lat_max - lat) / latSpan) * mapH;

        ctx.beginPath();
        for (const poly of land.geometry.coordinates) {
          for (const ring of poly) {
            for (let k = 0; k < ring.length; k++) {
              const px = lonToX(ring[k][0]);
              const py = latToY(ring[k][1]);
              if (k === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
          }
        }
        ctx.fillStyle = LAND;
        // evenodd so lakes inside land rings are cut out.
        ctx.fill("evenodd");
        ctx.strokeStyle = "rgba(20, 30, 40, 0.85)";
        ctx.lineWidth = 0.7 / view.scale; // constant width on screen
        ctx.stroke();
      }
      ctx.restore();

      // Map frame, drawn unclipped so the border is never half-cut.
      ctx.save();
      ctx.translate(view.x, view.y);
      ctx.scale(view.scale, view.scale);
      ctx.strokeStyle = "rgba(20,30,40,0.5)";
      ctx.lineWidth = 1 / view.scale;
      ctx.strokeRect(originX, originY, mapW, mapH);
      ctx.restore();
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [data, gridCanvas, land, view]);

  // --- pan / zoom ---------------------------------------------------------
  const onWheel = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setView((v) => {
      const next = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)),
      );
      const k = next / v.scale;
      // Keep the point under the cursor fixed while zooming.
      return next === MIN_SCALE
        ? { scale: 1, x: 0, y: 0 }
        : { scale: next, x: mx - k * (mx - v.x), y: my - k * (my - v.y) };
    });
  };

  const onPointerDown = (e) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const d = drag.current;
    setView((v) => ({
      ...v,
      x: d.ox + (e.clientX - d.sx),
      y: d.oy + (e.clientY - d.sy),
    }));
  };
  const onPointerUp = (e) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="map-wrap">
      <canvas
        ref={canvasRef}
        className="map-canvas"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {view.scale > 1 && (
        <button className="reset-view" onClick={() => setView({ scale: 1, x: 0, y: 0 })}>
          Reset view
        </button>
      )}
    </div>
  );
}

import { useLayoutEffect, useRef, useState } from "react";

const STEPS = [
  { title: "Welcome to 3D Ocean Explorer", text: "A guided workspace for comparing ocean model fields with real observation platforms across India's EEZ.", icon: "01" },
  { title: "Choose a data layer", text: "Display temperature, salinity, chlorophyll or ocean-current speed.", target: '[data-tour="variable"]' },
  { title: "Move through depth", text: "Inspect the surface or move down through the available water-column levels.", target: '[data-tour="depth"]' },
  { title: "Analyse time and forecasts", text: "Animate analysis months or enable the experimental 1–3 month forecast model.", target: '[data-tour="time"]' },
  { title: "Control the colour scale", text: "Change palettes, value ranges and linear or logarithmic scaling.", target: '[data-tour="colorbar"]' },
  { title: "Change the 3D display", text: "Switch between the surface, depth slices and volumetric rendering, then add currents or isosurfaces.", target: '[data-tour="layers"]' },
  { title: "Work with observations", text: "Filter Argo, Glider, CTD and BGC platforms, inspect profiles, or import new files.", target: '[data-tour="instruments"]' },
  { title: "Navigate analysis time", text: "Use Play or drag the month slider. The legend beside it explains the displayed values and units.", target: ".bottom-control-bar", placement: "above" },
  { title: "You are ready", text: "Drag the map to rotate, scroll to zoom, and select an observation marker to open its depth profile.", icon: "✓" },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export default function WelcomeGuide({ open, onClose }) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const nextRef = useRef(null);
  const current = STEPS[step];

  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const target = current.target ? document.querySelector(current.target) : null;
      target?.scrollIntoView({ block: "nearest", inline: "nearest" });
      const rect = target?.getBoundingClientRect();
      setTargetRect(rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } : null);
    };
    update();
    const frame = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    nextRef.current?.focus();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
    };
  }, [open, step, current.target]);

  if (!open) return null;

  const finish = () => {
    try { window.localStorage.setItem("oceanscope-guide-seen", "yes"); } catch { /* private browsing */ }
    setStep(0);
    onClose();
  };
  const goBack = () => setStep((value) => Math.max(0, value - 1));
  const goNext = () => step === STEPS.length - 1 ? finish() : setStep((value) => value + 1);
  const cardWidth = Math.min(390, window.innerWidth - 32);
  let cardStyle;
  if (targetRect) {
    if (current.placement === "above") {
      cardStyle = { left: clamp(targetRect.left + targetRect.width / 2 - cardWidth / 2, 16, window.innerWidth - cardWidth - 16), top: Math.max(16, targetRect.top - 238) };
    } else {
      const fitsRight = targetRect.right + cardWidth + 24 < window.innerWidth;
      cardStyle = { left: fitsRight ? targetRect.right + 20 : Math.max(16, targetRect.left - cardWidth - 20), top: clamp(targetRect.top + targetRect.height / 2 - 135, 76, window.innerHeight - 300) };
    }
  }

  return (
    <div className="guide-layer" onKeyDown={(event) => {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goBack();
    }}>
      {!targetRect && <div className="guide-dim" />}
      {targetRect && <div className="guide-target-ring" style={{ top: targetRect.top - 6, left: targetRect.left - 6, width: targetRect.width + 12, height: targetRect.height + 12 }} />}
      <section className={targetRect ? "guide-dialog contextual" : "guide-dialog welcome"} style={cardStyle} role="dialog" aria-modal="true" aria-labelledby="guide-title" aria-describedby="guide-description">
        <button className="guide-skip" onClick={finish}>Skip tour</button>
        {!targetRect && <div className="guide-icon" aria-hidden="true">{current.icon}</div>}
        <p className="guide-count" aria-live="polite">Step {step + 1} of {STEPS.length}</p>
        <h2 id="guide-title">{current.title}</h2>
        <p id="guide-description">{current.text}</p>
        <div className="guide-progress" aria-hidden="true">{STEPS.map((_, index) => <i key={index} className={index === step ? "active" : ""} />)}</div>
        <footer>
          <button className="guide-back" onClick={goBack} disabled={step === 0}>Back</button>
          <button ref={nextRef} className="guide-next" onClick={goNext}>{step === STEPS.length - 1 ? "Start exploring" : "Next"}</button>
        </footer>
        <span className="guide-key-hint">Use ← → keys to navigate</span>
      </section>
    </div>
  );
}

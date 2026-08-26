const DEPTH_WORDS = (d) =>
  d <= 10
    ? "right at the surface"
    : d <= 60
      ? `about ${d} m down — roughly the depth sunlight reaches`
      : d <= 120
        ? `${d} m down, below the sunlit layer`
        : `${d} m down, in the deep, cold water`;

/**
 * Plain-language caption for Explore mode.
 *
 * Outreach audiences need to know what they are looking at before any control
 * means anything, so this restates the current view in ordinary words.
 */
export default function ExploreCaption({ variable, label, depth, monthLabel, range, units }) {
  const what =
    variable === "salinity"
      ? "how salty the seawater is. Rivers pour fresh water into the Bay of Bengal, so it is less salty there than the Arabian Sea."
      : "how warm the seawater is. Warmer colours are warmer water, and taller ridges mean higher values.";

  return (
    <section className="explore-caption">
      <h2 className="explore-caption-title">What am I looking at?</h2>
      <p>
        This is <strong>{label.toLowerCase()}</strong> across the ocean around
        India in <strong>{monthLabel}</strong>, measured{" "}
        <strong>{DEPTH_WORDS(depth)}</strong>. The colours show {what}
      </p>
      {range?.min != null && (
        <p className="explore-caption-range">
          Right now it ranges from {range.min} to {range.max} {units} — drag to
          spin the ocean, and use the panel on the right to dive deeper or move
          through the months.
        </p>
      )}
    </section>
  );
}

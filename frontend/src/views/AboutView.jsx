const SOURCES = [
  {
    name: "INCOIS ERDDAP — incois_argo_mnt_VAM",
    what: "Gridded monthly temperature and salinity, produced by INCOIS from Argo float profiles using Variational Analysis Methodology. Drives the terrain surface and the hazard computation.",
    url: "https://erddap.incois.gov.in/erddap/griddap/incois_argo_mnt_VAM.html",
    tag: "Real observational analysis",
  },
  {
    name: "INCOIS ERDDAP — Indian_ARGO_Floats",
    what: "Individual Argo float cycles with full depth profiles of temperature and salinity. Drives the float markers and their profile charts.",
    url: "https://erddap.incois.gov.in/erddap/tabledap/Indian_ARGO_Floats.html",
    tag: "Real in-situ instrument data",
  },
  {
    name: "Natural Earth 1:10m physical land",
    what: "Public-domain coastline and island polygons, clipped to the region and extruded into the 3D scene.",
    url: "https://www.naturalearthdata.com/",
    tag: "Public domain cartography",
  },
];

const ACRONYMS = [
  ["INCOIS", "Indian National Centre for Ocean Information Services — the agency this platform is built for."],
  ["EEZ", "Exclusive Economic Zone — the sea area, out to 200 nautical miles, where a state has special rights."],
  ["Argo", "A global array of ~4,000 drifting floats that dive to ~2,000 m and report temperature and salinity profiles."],
  ["VAM", "Variational Analysis Methodology — the scheme INCOIS uses to turn scattered float profiles into a regular grid."],
  ["TCHP", "Tropical Cyclone Heat Potential — heat stored above the 26 °C isotherm; a deep warm layer can fuel cyclone intensification."],
  ["D26", "The depth at which sea temperature falls to 26 °C. The deeper it sits, the more heat is available to a storm."],
  ["PSU", "Practical Salinity Unit — the standard measure of how salty seawater is (open ocean is roughly 33–37)."],
  ["CTD", "Conductivity, Temperature, Depth — the sensor package used to measure ocean profiles."],
  ["NetCDF", "Network Common Data Form — the self-describing array file format ocean and climate data ships in."],
  ["ERDDAP", "The data server INCOIS and NOAA publish through; it serves subsets of large datasets over HTTP."],
];

/**
 * About / Data Sources.
 *
 * The published problem statement left its Acronyms and Dataset Link tables
 * blank. This section supplies both, for the sources actually powering the app.
 */
export default function AboutView() {
  return (
    <div className="page">
      <div className="page-inner">
        <header className="page-head">
          <h1 className="page-title">About OceanScope</h1>
          <p className="page-lede">
            A 3D visualization and decision-support prototype for INCOIS ocean
            data over India&rsquo;s Exclusive Economic Zone, built for SIH26067.
          </p>
        </header>

        <section className="page-section">
          <h2 className="section-title">Data sources</h2>
          <p className="section-note">
            Every surface, marker and advisory in this application is computed
            from the real datasets below. There is no synthetic, procedural or
            placeholder ocean data anywhere in the app — where a variable has no
            source, it is greyed out rather than filled in.
          </p>
          <ul className="source-list">
            {SOURCES.map((s) => (
              <li key={s.name}>
                <div className="source-top">
                  <h3>{s.name}</h3>
                  <span className="source-tag">{s.tag}</span>
                </div>
                <p>{s.what}</p>
                <a href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.url}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="page-section">
          <h2 className="section-title">Acronyms</h2>
          <p className="section-note">
            Every term that appears in this interface, in plain language.
          </p>
          <dl className="glossary">
            {ACRONYMS.map(([term, meaning]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="page-section">
          <h2 className="section-title">Method &amp; limitations</h2>
          <ul className="limits">
            <li>
              <strong>Grid resolution.</strong> INCOIS publishes this product on
              a 1° grid, so the region is 21×33 real samples. The renderer
              bilinearly upsamples for a smooth mesh — display interpolation
              only. Every number shown comes from the native values.
            </li>
            <li>
              <strong>Hazard indicator is a proxy.</strong> TCHP is computed
              over 5 depth levels, so D26 is interpolated between coarse levels.
              It locates and ranks deep warm pools correctly, but it is not an
              operational INCOIS bulletin.
            </li>
            <li>
              <strong>Currents are not shown.</strong> The gridded Argo product
              carries no velocity field. INCOIS publishes geostrophic currents
              separately, covering 2004–2019 only.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

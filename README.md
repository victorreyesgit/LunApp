# Moonwatch

A small, static, single-page site that shows the Moon's current phase,
illumination, and rise/set times for wherever you are — calculated
entirely in your browser. No backend, no build step, no APIs, no
tracking.

Live structure:

```
.
├── index.html            # markup + the SVG moon
├── css/
│   └── styles.css        # all styling (system fonts only, no CDNs)
├── js/
│   ├── astro.js           # pure astronomy calculations — no DOM
│   ├── moonView.js         # turns a phase angle into the SVG shape
│   └── app.js              # DOM/geolocation/slider glue
├── tests/
│   ├── astro.test.mjs      # `node --test` suite
│   └── index.html          # the same checks, runnable in a browser
├── package.json            # only used to run tests locally; no deps
└── README.md
```

## Running it

There's nothing to build. Two ways to view it locally:

1. **VS Code + Live Server** (or any static file server) — open the
   folder, right-click `index.html`, "Open with Live Server". Plain
   `file://` also mostly works, except that some browsers restrict
   `fetch`-like module loading over `file://`; a local server avoids
   that entirely.
2. Any quick static server, e.g. `python3 -m http.server` from the
   project root, then visit `http://localhost:8000`.

Geolocation requires a "secure context" — `https://` or `localhost` —
so use `localhost`, not a plain IP address, when testing locally.

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository (the files can live at the
   repo root, or under `/docs` if you prefer).
2. In the repo: **Settings → Pages → Source**, pick the branch and
   folder you pushed to.
3. GitHub serves it as static files — no build step, no server code,
   so there's nothing else to configure. The site is 100% front-end,
   which is exactly what GitHub Pages hosts.

## Running the tests

```
npm test
```

which just runs `node --test tests/astro.test.mjs` — there are no
dependencies to install. You can also open `tests/index.html` directly
in a browser (locally or once deployed) to run the same checks with
zero tooling at all, which is handy for confirming the deployed copy
behaves the same as your local one.

## Architecture notes

- **`astro.js` has no DOM access.** Every function takes plain numbers
  or `Date` objects and returns plain numbers/objects. That's what
  makes it possible to test with plain `node --test`, and it means the
  math can be read, checked, or replaced without touching anything
  that draws pixels.
- **`moonView.js` knows nothing about dates or location.** It takes an
  elongation angle (0–360°) and moves one SVG `<circle>` (the clip
  path for the "lit" layer). The illuminated shape is modeled as the
  geometric overlap of two equal circles — the Moon's disc, fixed, and
  a second "light" disc that slides across it as the phase advances.
  This is a common, robust way to draw crescent/gibbous shapes with
  SVG or CSS; it's a close visual approximation of the real terminator
  (which is actually an ellipse arc, not a circular arc), good enough
  for a schematic illustration, not for measuring limb shape.
- **`app.js` is the only file that touches `document`, `navigator`, or
  `localStorage`.** It asks for geolocation, works out the browser's
  own timezone offset for the date in question (`Date.getTimezoneOffset()`,
  which is already DST-aware per-instant), and wires the slider to
  re-run the same pure functions from `astro.js` for whatever date is
  selected.

## Privacy

- No network requests of any kind are made by this site. Open your
  browser's network panel and there's nothing to see — no analytics,
  no fonts fetched from a CDN, no external scripts.
- Geolocation, if you grant it, is read once via the browser's
  `navigator.geolocation` API and used only to compute rise/set times
  locally. It is never transmitted anywhere.
- The only thing written to storage is an optional cached `{lat, lon}`
  pair in `localStorage`, purely so the page doesn't sit blank while a
  fresh geolocation fix comes back on your next visit. It lives only
  in your own browser and you can clear it any time by clearing site
  data.
- You can skip geolocation entirely and type coordinates in by hand —
  the "Change location" control is always available.

## Accuracy and limitations

The goal here is a nice, honest personal site, not a substitute for a
professional ephemeris. Everything is built from the standard
**low-precision formulas** in Jean Meeus, *Astronomical Algorithms*
(2nd ed.), chapters 22, 25, 47 and 49 — the same family of
approximations behind many small open-source Moon widgets. They trade
a documented, small amount of accuracy for code that stays readable.

**What's included and what isn't:**

- Sun position: single equation-of-center term (ch. 25's low-precision
  form).
- Moon position: the single-dominant-term longitude/latitude/distance
  formula (ch. 47's low-precision form), not the full ~60-term
  periodic series.
- New/Full Moon timing: the exact mean-phase formula plus the dominant
  ~14 of Meeus's ~24 periodic correction terms (ch. 49).
- Atmospheric refraction is treated as a constant (standard horizon
  refraction, ~34′), not adjusted for temperature/pressure.
- Nutation and annual aberration are ignored; the obliquity of the
  ecliptic is treated as constant. These are all sub-arcminute effects
  at the timescales this site cares about.
- ΔT (the small, slowly-drifting difference between civil UTC and the
  dynamical time used in the phase formulas) is ignored. It's on the
  order of a minute today and won't meaningfully affect anything shown
  here, but it does mean phase timestamps aren't laboratory-grade.

**Measured accuracy** (see `tests/astro.test.mjs` for the exact
checks, cross-referenced against independent published sources in
September 2026):

| Quantity | Typical error | Notes |
|---|---|---|
| Illumination fraction | < 0.5% | dominant-term Moon longitude is usually accurate to a few arcminutes near syzygy |
| New Moon / Full Moon time | a few minutes, worst case roughly ±1 hour | verified against January 2026 reference times to within ~5 minutes |
| Moonrise / moonset | a few minutes for mid-latitudes | verified against a New York-area reference to within ~3 minutes |

**Where it gets less reliable:**

- **High latitudes** (roughly beyond ±60°), where the Moon can stay
  above or below the horizon for unusually long stretches: the search
  window in `findNextRiseSet` may occasionally miss an event, or a
  given "day" may genuinely have zero or two rise/set events — the UI
  shows `—` rather than guessing.
- **Rise/set near the poles or during periods when the Moon doesn't
  cross the horizon** aren't specially detected as "circumpolar" —
  they just show as no event found.
- **The site assumes your device's system timezone matches wherever
  your entered/detected coordinates actually are.** If you set a
  location far from your device's timezone (e.g. checking the Moon for
  a trip before you travel), "today" is computed using your device's
  local midnight, not the destination's — the moment-based facts
  (illumination, next rise/set, next new/full moon) are still
  correct, just always expressed in your device's own timezone.
- Dates very far from today (centuries) will drift further from a
  full ephemeris than the figures above, since the periodic
  correction terms are truncated series that are most accurate near
  the present epoch.

If you need better-than-a-few-minutes accuracy — for photography
planning down to the minute, occultation timing, or anything
similarly precise — use a dedicated ephemeris tool (e.g. one built on
JPL Horizons or the full VSOP87/ELP2000 series) instead.

## License / attribution

The formulas used are standard published astronomical algorithms (not
anyone's copyrighted code); the implementation here is original. No
external assets, fonts, or libraries are used anywhere in the site.

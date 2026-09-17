/**
 * astro.js
 * ---------------------------------------------------------------------------
 * Pure astronomical calculations for the Moon site.
 *
 * Deliberately isolated from the DOM: every function here takes plain
 * numbers/Dates and returns plain numbers/objects. This makes the module
 * usable from the browser (as an ES module) AND from Node for automated
 * tests, and keeps "what does the sky look like" separate from
 * "how do we draw it on screen".
 *
 * The formulas are the standard low-precision approximations published in
 * Jean Meeus, "Astronomical Algorithms" (2nd ed.), chapters 22, 25, 47 and
 * 49. They trade a small, well-understood amount of accuracy for code that
 * a person can read in one sitting. See README.md for a full discussion of
 * accuracy and limitations.
 */

// ---------------------------------------------------------------------------
// Constants & small helpers
// ---------------------------------------------------------------------------

const RAD = Math.PI / 180;
const MS_PER_DAY = 86400000;

/** Julian Date of the Unix epoch (1970-01-01T00:00:00Z). */
const JD_UNIX_EPOCH = 2440587.5;

/** J2000.0 epoch, as a Julian Date (2000-01-01T12:00:00Z). */
const JD_J2000 = 2451545.0;

/** Mean length of a synodic month (new moon to new moon), in days. */
export const SYNODIC_MONTH_DAYS = 29.530588861;

/** Mean obliquity of the ecliptic (J2000.0), in degrees. Drifts by only
 *  about 0.013 deg/century, so treating it as constant is fine here. */
const OBLIQUITY_DEG = 23.4397;

/** Mean equatorial radius of the Earth, km (used for parallax). */
const EARTH_RADIUS_KM = 6378.14;

function normalizeDeg(deg) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function normalizeRad(rad) {
  let r = rad % (2 * Math.PI);
  if (r < 0) r += 2 * Math.PI;
  return r;
}

/** Days since J2000.0 (2000-01-01T12:00 UTC), fractional. */
export function daysSinceJ2000(date) {
  return (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / MS_PER_DAY;
}

/** Julian Date for a given JS Date. */
export function toJulianDate(date) {
  return date.getTime() / MS_PER_DAY + JD_UNIX_EPOCH;
}

/** JS Date (UTC) for a given Julian Date. */
export function fromJulianDate(jd) {
  return new Date((jd - JD_UNIX_EPOCH) * MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Sun position (low precision, Meeus ch. 25)
// ---------------------------------------------------------------------------

/**
 * Geocentric apparent ecliptic longitude of the Sun.
 * @param {number} d days since J2000.0
 * @returns {number} longitude in radians, normalized to [0, 2*PI)
 */
export function sunEclipticLongitude(d) {
  const M = RAD * normalizeDeg(357.5291 + 0.98560028 * d); // mean anomaly
  const C =
    RAD *
    (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)); // equation of center
  const P = RAD * 102.9372; // longitude of perihelion
  return normalizeRad(M + C + P + Math.PI);
}

// ---------------------------------------------------------------------------
// Moon position (low precision, Meeus ch. 47)
// ---------------------------------------------------------------------------

/**
 * Geocentric ecliptic position of the Moon.
 * @param {number} d days since J2000.0
 * @returns {{lon: number, lat: number, dist: number}} lon/lat in radians,
 *   dist in km. Typical error vs. full theory: < ~0.3 deg in longitude,
 *   < ~0.2 deg in latitude (see README).
 */
export function moonPosition(d) {
  const L = RAD * normalizeDeg(218.316 + 13.176396 * d); // mean longitude
  const M = RAD * normalizeDeg(134.963 + 13.064993 * d); // mean anomaly
  const F = RAD * normalizeDeg(93.272 + 13.22935 * d); // argument of latitude

  const lon = L + RAD * 6.289 * Math.sin(M);
  const lat = RAD * 5.128 * Math.sin(F);
  const dist = 385001 - 20905 * Math.cos(M); // km

  return { lon: normalizeRad(lon), lat, dist };
}

/** Convert ecliptic coordinates to equatorial (RA/Dec), both in radians. */
export function eclipticToEquatorial(lon, lat) {
  const e = RAD * OBLIQUITY_DEG;
  const ra = Math.atan2(
    Math.sin(lon) * Math.cos(e) - Math.tan(lat) * Math.sin(e),
    Math.cos(lon)
  );
  const dec = Math.asin(
    Math.sin(lat) * Math.cos(e) + Math.cos(lat) * Math.sin(e) * Math.sin(lon)
  );
  return { ra: normalizeRad(ra), dec };
}

/** Moon's geocentric equatorial position + distance for a given Date. */
export function moonEquatorial(date) {
  const d = daysSinceJ2000(date);
  const pos = moonPosition(d);
  const { ra, dec } = eclipticToEquatorial(pos.lon, pos.lat);
  return { ra, dec, dist: pos.dist };
}

// ---------------------------------------------------------------------------
// Phase, illumination, waxing/waning
// ---------------------------------------------------------------------------

/**
 * Full phase description for a given instant.
 * @param {Date} date
 * @returns {{
 *   elongationDeg: number,   // 0..360, angular separation Moon-Earth-Sun
 *   illumination: number,    // 0..1 fraction of the disc lit
 *   waxing: boolean,
 *   ageDays: number,         // days since the preceding new moon (approx)
 *   phaseName: string
 * }}
 */
export function moonPhase(date) {
  const d = daysSinceJ2000(date);
  const sunLon = sunEclipticLongitude(d);
  const moon = moonPosition(d);

  const elongation = normalizeRad(moon.lon - sunLon);
  const elongationDeg = elongation / RAD;

  const illumination = (1 - Math.cos(elongation)) / 2;
  const waxing = elongation < Math.PI;
  const ageDays = (elongation / (2 * Math.PI)) * SYNODIC_MONTH_DAYS;

  return {
    elongationDeg,
    illumination,
    waxing,
    ageDays,
    phaseName: phaseName(elongationDeg),
  };
}

const PHASE_NAMES = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent",
];

/** Human phase name for an elongation angle in degrees (0..360). */
export function phaseName(elongationDeg) {
  const idx = Math.round(elongationDeg / 45) % 8;
  return PHASE_NAMES[idx];
}

// ---------------------------------------------------------------------------
// Local sidereal time / topocentric altitude
// ---------------------------------------------------------------------------

/** Greenwich Mean Sidereal Time, in radians, for a given Date. */
export function siderealTime(date) {
  const d = daysSinceJ2000(date);
  const theta = normalizeDeg(280.16 + 360.9856235 * d);
  return RAD * theta;
}

/**
 * Topocentric altitude of the Moon above the horizon.
 * @param {Date} date
 * @param {number} latDeg observer latitude, degrees (+N)
 * @param {number} lonDeg observer longitude, degrees (+E)
 * @returns {{altitudeDeg: number, parallaxDeg: number}}
 */
export function moonAltitude(date, latDeg, lonDeg) {
  const { ra, dec, dist } = moonEquatorial(date);
  const gst = siderealTime(date);
  const lst = normalizeRad(gst + RAD * lonDeg);
  const H = normalizeRad(lst - ra); // hour angle
  const phi = RAD * latDeg;

  const sinAlt =
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  const altitudeDeg = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;

  const parallaxDeg = Math.asin(EARTH_RADIUS_KM / dist) / RAD;

  return { altitudeDeg, parallaxDeg };
}

// ---------------------------------------------------------------------------
// Moonrise / moonset
// ---------------------------------------------------------------------------

/**
 * Reference altitude (degrees) at which the Moon's centre counts as
 * "rising" or "setting", accounting for its (variable) horizontal
 * parallax and average atmospheric refraction at the horizon.
 * Meeus (15.1): h0 = 0.7275 * parallax - 34'/60
 */
function riseSetAltitude(parallaxDeg) {
  return 0.7275 * parallaxDeg - 34 / 60;
}

/**
 * Scan forward from `startDate` in fixed steps looking for the Moon's
 * altitude crossing the rise/set reference altitude, then refine the
 * crossing time by linear interpolation. This brute-force search avoids
 * the edge cases (no event that day, two events, circumpolar-style
 * situations) that closed-form interpolation formulas mishandle.
 *
 * @param {Date} startDate  where to start scanning
 * @param {number} latDeg
 * @param {number} lonDeg
 * @param {"rise"|"set"} type
 * @param {number} maxHours  how far forward to search
 * @param {number} stepMinutes  coarse scan step
 * @returns {Date|null} time of the next event, or null if none found
 *   within the search window
 */
export function findNextRiseSet(
  startDate,
  latDeg,
  lonDeg,
  type,
  maxHours = 48,
  stepMinutes = 10
) {
  const stepMs = stepMinutes * 60 * 1000;
  const steps = Math.ceil((maxHours * 60) / stepMinutes);

  let prevTime = startDate.getTime();
  let prev = moonAltitude(new Date(prevTime), latDeg, lonDeg);
  let prevDiff = prev.altitudeDeg - riseSetAltitude(prev.parallaxDeg);

  for (let i = 1; i <= steps; i++) {
    const curTime = prevTime + stepMs;
    const cur = moonAltitude(new Date(curTime), latDeg, lonDeg);
    const curDiff = cur.altitudeDeg - riseSetAltitude(cur.parallaxDeg);

    const crossesUp = prevDiff < 0 && curDiff >= 0; // rise
    const crossesDown = prevDiff >= 0 && curDiff < 0; // set

    if ((type === "rise" && crossesUp) || (type === "set" && crossesDown)) {
      // Linear interpolation between the two samples for a finer time,
      // then one bisection pass for a bit more precision.
      let lo = prevTime;
      let hi = curTime;
      let loDiff = prevDiff;
      for (let b = 0; b < 6; b++) {
        const mid = (lo + hi) / 2;
        const midAlt = moonAltitude(new Date(mid), latDeg, lonDeg);
        const midDiff = midAlt.altitudeDeg - riseSetAltitude(midAlt.parallaxDeg);
        if ((loDiff < 0) === (midDiff < 0)) {
          lo = mid;
          loDiff = midDiff;
        } else {
          hi = mid;
        }
      }
      return new Date(Math.round((lo + hi) / 2));
    }

    prevTime = curTime;
    prevDiff = curDiff;
  }

  return null; // no event found in the window (rare; e.g. very high latitude)
}

/**
 * Moonrise and moonset for the *local calendar day* containing `date`,
 * i.e. the first rise/set found after local midnight and before the
 * following local midnight. "Local" is taken from the supplied
 * `timeZoneOffsetMinutes` (minutes to ADD to UTC to get local time),
 * which the UI layer derives from the browser.
 */
export function riseSetForDay(date, latDeg, lonDeg, timeZoneOffsetMinutes) {
  const offsetMs = timeZoneOffsetMinutes * 60 * 1000;
  const localMs = date.getTime() + offsetMs;
  const localMidnightMs = Math.floor(localMs / MS_PER_DAY) * MS_PER_DAY;
  const dayStart = new Date(localMidnightMs - offsetMs);
  const dayEnd = new Date(localMidnightMs + MS_PER_DAY - offsetMs);

  const findWithinDay = (type) => {
    // Look a little before dayStart too, in case the search step skips
    // an event that starts exactly at midnight.
    const seedStart = new Date(dayStart.getTime() - 5 * 60 * 1000);
    const result = findNextRiseSet(seedStart, latDeg, lonDeg, type, 26, 5);
    if (result && result.getTime() < dayEnd.getTime()) return result;
    return null;
  };

  return {
    rise: findWithinDay("rise"),
    set: findWithinDay("set"),
  };
}

// ---------------------------------------------------------------------------
// Next New Moon / Full Moon (Meeus ch. 49, truncated periodic terms)
// ---------------------------------------------------------------------------

/**
 * Julian Ephemeris Day of the new/full moon nearest lunation number k.
 * k must be an integer (new moon) or integer + 0.5 (full moon).
 */
function meeusPhaseJDE(k) {
  const T = k / 1236.85; // Julian centuries since J2000.0

  const JDE =
    2451550.09766 +
    29.530588861 * k +
    0.00015437 * T * T -
    0.00000015 * T * T * T +
    0.00000000073 * T * T * T * T;

  const E = 1 - 0.002516 * T - 0.0000074 * T * T;

  const M = RAD * normalizeDeg(2.5534 + 29.1053567 * k - 0.0000014 * T * T); // Sun mean anomaly
  const Mp = RAD * normalizeDeg(
    201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T * T * T
  ); // Moon mean anomaly
  const F = RAD * normalizeDeg(
    160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T * T * T
  ); // Moon argument of latitude

  const isFullMoon = Math.abs((k % 1) - 0.5) < 1e-6 || Math.abs((k % 1) + 0.5) < 1e-6;

  // Dominant periodic correction terms (days). This is a deliberately
  // truncated subset of Meeus's ~24-term series -- see README for the
  // resulting accuracy budget.
  let correction =
    -0.4072 * Math.sin(Mp) +
    0.17241 * E * Math.sin(M) +
    0.01608 * Math.sin(2 * Mp) +
    0.01039 * Math.sin(2 * F) +
    0.00739 * E * Math.sin(Mp - M) -
    0.00514 * E * Math.sin(Mp + M) +
    0.00208 * E * E * Math.sin(2 * M) -
    0.00111 * Math.sin(Mp - 2 * F) -
    0.00057 * Math.sin(Mp + 2 * F) +
    0.00056 * E * Math.sin(2 * Mp + M) -
    0.00042 * Math.sin(3 * Mp) +
    0.00042 * E * Math.sin(M + 2 * F) +
    0.00038 * E * Math.sin(M - 2 * F) -
    0.00024 * E * Math.sin(2 * Mp - M);

  if (isFullMoon) {
    // The full-moon series has a small additional correction not present
    // for new moon (Meeus 49, "Additional corrections").
    correction += 0.00306;
  }

  return JDE + correction;
}

/**
 * Next New Moon (or Full Moon) at or after `fromDate`.
 * @param {Date} fromDate
 * @param {0|0.5} phaseOffset 0 = new moon, 0.5 = full moon
 * @returns {Date}
 */
export function nextMoonPhaseDate(fromDate, phaseOffset) {
  const decimalYear =
    fromDate.getUTCFullYear() +
    (fromDate.getUTCMonth() + fromDate.getUTCDate() / 30.44) / 12;

  let k = Math.floor((decimalYear - 2000) * 12.3685) - 2 + phaseOffset;
  let candidate = fromJulianDate(meeusPhaseJDE(k));

  // Step forward in whole lunations (k += 1 keeps the .0 / .5 offset)
  // until we find one after fromDate.
  let guard = 0;
  while (candidate.getTime() <= fromDate.getTime() && guard < 12) {
    k += 1;
    candidate = fromJulianDate(meeusPhaseJDE(k));
    guard++;
  }
  return candidate;
}

export function nextNewMoon(fromDate) {
  return nextMoonPhaseDate(fromDate, 0);
}

export function nextFullMoon(fromDate) {
  return nextMoonPhaseDate(fromDate, 0.5);
}

/**
 * astro.test.mjs
 * ---------------------------------------------------------------------------
 * Run with:  node --test tests/astro.test.mjs
 *
 * These tests check the astronomy module in two ways:
 *  1. Internal consistency (round trips, monotonicity, valid ranges).
 *  2. Agreement with independently published reference values for a few
 *     specific instants (see the comments above each check for sources).
 *     Tolerances are set from the accuracy budget documented in README.md,
 *     not tightened to whatever the code happens to produce.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  daysSinceJ2000,
  toJulianDate,
  fromJulianDate,
  sunEclipticLongitude,
  moonPosition,
  moonPhase,
  phaseName,
  siderealTime,
  moonAltitude,
  riseSetForDay,
  findNextRiseSet,
  nextNewMoon,
  nextFullMoon,
  SYNODIC_MONTH_DAYS,
} from "../js/astro.js";
import { moonBoundaryPoints } from "../js/moonView.js";

const MINUTES = 60 * 1000;
const HOURS = 60 * MINUTES;
const DAYS = 24 * HOURS;

// ---------------------------------------------------------------------------
// Time conversions
// ---------------------------------------------------------------------------

test("toJulianDate / fromJulianDate round-trip", () => {
  const d = new Date("2026-06-15T00:00:00Z");
  const jd = toJulianDate(d);
  const back = fromJulianDate(jd);
  assert.ok(Math.abs(back.getTime() - d.getTime()) < 1000);
});

test("daysSinceJ2000 is 0 at the J2000 epoch", () => {
  const j2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
  assert.ok(Math.abs(daysSinceJ2000(j2000)) < 1e-9);
});

// ---------------------------------------------------------------------------
// Sun / Moon positions
// ---------------------------------------------------------------------------

test("sunEclipticLongitude stays within [0, 2*PI)", () => {
  for (let y = 2020; y <= 2030; y++) {
    const d = daysSinceJ2000(new Date(Date.UTC(y, 5, 1)));
    const lon = sunEclipticLongitude(d);
    assert.ok(lon >= 0 && lon < 2 * Math.PI, `out of range for ${y}`);
  }
});

test("moonPosition distance stays within the Moon's real orbital range", () => {
  for (let m = 0; m < 12; m++) {
    const d = daysSinceJ2000(new Date(Date.UTC(2026, m, 15)));
    const { dist } = moonPosition(d);
    // True perigee/apogee range is about 356,500-406,700 km; our
    // truncated series has a bit of slack either side of that.
    assert.ok(dist > 350000 && dist < 410000, `distance ${dist} out of range`);
  }
});

// ---------------------------------------------------------------------------
// Phase / illumination — cross-checked against published new/full moon
// instants for January 2026 (TheSkyLive.com and multiple almanac sources,
// cross-referenced September 2026):
//   New Moon:  2026-01-18 ~19:52 UTC
//   Full Moon: 2026-01-03 ~10:08 UTC
// ---------------------------------------------------------------------------

test("illumination is ~0 at a known new moon instant", () => {
  const knownNewMoon = new Date("2026-01-18T19:52:00Z");
  const { illumination } = moonPhase(knownNewMoon);
  assert.ok(illumination < 0.01, `illumination was ${illumination}`);
});

test("illumination is ~1 at a known full moon instant", () => {
  const knownFullMoon = new Date("2026-01-03T10:08:00Z");
  const { illumination } = moonPhase(knownFullMoon);
  assert.ok(illumination > 0.99, `illumination was ${illumination}`);
});

test("phase flips from waning to waxing across a new moon", () => {
  const knownNewMoon = new Date("2026-01-18T19:52:00Z").getTime();
  const before = moonPhase(new Date(knownNewMoon - 2 * DAYS));
  const after = moonPhase(new Date(knownNewMoon + 2 * DAYS));
  assert.equal(before.waxing, false);
  assert.equal(after.waxing, true);
});

test("phaseName covers the full 0-360 range without gaps", () => {
  const names = new Set();
  for (let deg = 0; deg < 360; deg += 1) {
    names.add(phaseName(deg));
  }
  assert.equal(names.size, 8);
});

// ---------------------------------------------------------------------------
// Next new/full moon
// ---------------------------------------------------------------------------

test("nextNewMoon matches the known January 2026 new moon", () => {
  const from = new Date("2026-01-01T00:00:00Z");
  const result = nextNewMoon(from);
  const expected = new Date("2026-01-18T19:52:00Z");
  const diffMinutes = Math.abs(result.getTime() - expected.getTime()) / MINUTES;
  assert.ok(diffMinutes < 10, `off by ${diffMinutes} minutes`);
});

test("nextFullMoon matches the known January 2026 full moon", () => {
  const from = new Date("2025-12-20T00:00:00Z");
  const result = nextFullMoon(from);
  const expected = new Date("2026-01-03T10:08:00Z");
  const diffMinutes = Math.abs(result.getTime() - expected.getTime()) / MINUTES;
  assert.ok(diffMinutes < 10, `off by ${diffMinutes} minutes`);
});

test("nextNewMoon is always strictly after the reference date", () => {
  for (let i = 0; i < 20; i++) {
    const from = new Date(Date.UTC(2024, 0, 1) + i * 17 * DAYS);
    const result = nextNewMoon(from);
    assert.ok(result.getTime() > from.getTime());
  }
});

test("consecutive new moons are one synodic month apart", () => {
  const nm1 = nextNewMoon(new Date("2026-03-01T00:00:00Z"));
  const nm2 = nextNewMoon(new Date(nm1.getTime() + DAYS));
  const gapDays = (nm2.getTime() - nm1.getTime()) / DAYS;
  assert.ok(Math.abs(gapDays - SYNODIC_MONTH_DAYS) < 0.5);
});

// ---------------------------------------------------------------------------
// Rise / set — cross-checked against timeanddate.com for New City, NY
// (41.15N, 73.99W) on 2026-03-15 (EDT, UTC-4): rise ~5:31am, set ~3:25pm
// local, cross-referenced September 2026.
// ---------------------------------------------------------------------------

test("riseSetForDay matches a published reference within ~10 minutes", () => {
  const lat = 41.15;
  const lon = -73.99;
  const tzOffsetMinutes = -4 * 60; // EDT
  const { rise, set } = riseSetForDay(
    new Date("2026-03-15T12:00:00Z"),
    lat,
    lon,
    tzOffsetMinutes
  );

  assert.ok(rise, "expected a moonrise that day");
  assert.ok(set, "expected a moonset that day");

  const expectedRise = new Date("2026-03-15T09:31:00Z");
  const expectedSet = new Date("2026-03-15T19:25:00Z");

  assert.ok(Math.abs(rise.getTime() - expectedRise.getTime()) / MINUTES < 10);
  assert.ok(Math.abs(set.getTime() - expectedSet.getTime()) / MINUTES < 10);
});

test("findNextRiseSet always returns a time after the start", () => {
  const start = new Date("2026-06-01T00:00:00Z");
  const rise = findNextRiseSet(start, 51.5, -0.13, "rise");
  const set = findNextRiseSet(start, 51.5, -0.13, "set");
  assert.ok(rise > start);
  assert.ok(set > start);
  // The Moon rises/sets roughly every ~24h50m, so the next event of
  // either kind should always be within 2 days.
  assert.ok(rise.getTime() - start.getTime() < 2 * DAYS);
  assert.ok(set.getTime() - start.getTime() < 2 * DAYS);
});

// The "Coming up" panel shows whichever of next rise/next set happens
// sooner, first, and treats "moonset is sooner" as "the Moon is up". This
// checks both branches actually occur as the Moon cycles through a day.
test("moon-is-up flips correctly between consecutive rise/set pairs", () => {
  const lat = 51.5;
  const lon = -0.13;
  let sawMoonUp = false;
  let sawMoonDown = false;

  for (let h = 0; h < 48; h += 3) {
    const now = new Date(Date.UTC(2026, 5, 1, 0, 0, 0) + h * HOURS);
    const nextRise = findNextRiseSet(now, lat, lon, "rise");
    const nextSet = findNextRiseSet(now, lat, lon, "set");
    const moonIsUp = Boolean(nextSet) && (!nextRise || nextSet.getTime() < nextRise.getTime());
    if (moonIsUp) sawMoonUp = true;
    else sawMoonDown = true;
  }

  assert.ok(sawMoonUp, "expected at least one 'Moon is up' moment in 48h");
  assert.ok(sawMoonDown, "expected at least one 'Moon is down' moment in 48h");
});

// ---------------------------------------------------------------------------
// Rendered shape vs. reported illumination
//
// The visualization must not just look plausible — its actual drawn area
// has to match the illumination percentage shown next to it. An earlier
// version used a "two overlapping circles" approximation that looked
// reasonable but was quantitatively wrong (e.g. it drew ~39% lit at exact
// first quarter, while the label correctly said 50%). These tests check
// the geometry directly via the shoelace formula so that kind of mismatch
// can't silently come back.
// ---------------------------------------------------------------------------

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

test("rendered lit area matches moonPhase().illumination at first quarter", () => {
  const radius = 80;
  const fullArea = Math.PI * radius * radius;
  const points = moonBoundaryPoints(90, radius, 200);
  const fraction = polygonArea(points) / fullArea;
  assert.ok(
    Math.abs(fraction - 0.5) < 0.01,
    `expected ~50% lit at first quarter, got ${(fraction * 100).toFixed(1)}%`
  );
});

test("rendered lit area matches the illumination fraction across the cycle", () => {
  const radius = 80;
  const fullArea = Math.PI * radius * radius;
  for (const deg of [10, 45, 90, 135, 170, 190, 225, 270, 315, 350]) {
    const points = moonBoundaryPoints(deg, radius, 200);
    const drawnFraction = polygonArea(points) / fullArea;
    const expectedFraction = (1 - Math.cos((deg * Math.PI) / 180)) / 2;
    assert.ok(
      Math.abs(drawnFraction - expectedFraction) < 0.01,
      `at ${deg}deg expected ${(expectedFraction * 100).toFixed(1)}% but drew ${(drawnFraction * 100).toFixed(1)}%`
    );
  }
});

test("at first quarter the terminator is a near-vertical straight line", () => {
  // A real quarter Moon's terminator is a straight diameter, not curved.
  const points = moonBoundaryPoints(90, 80, 40);
  // Terminator half of the boundary is the second half of the point list.
  const terminatorXs = points.slice(points.length / 2).map(([x]) => x);
  const maxDeviation = Math.max(...terminatorXs.map((x) => Math.abs(x)));
  assert.ok(maxDeviation < 0.5, `terminator bulged by up to ${maxDeviation}`);
});

test("moonAltitude is a finite number and siderealTime stays in range", () => {
  const d = new Date("2026-06-01T12:00:00Z");
  const { altitudeDeg } = moonAltitude(d, 40, -74);
  assert.ok(Number.isFinite(altitudeDeg));
  assert.ok(altitudeDeg >= -90 && altitudeDeg <= 90);

  const gst = siderealTime(d);
  assert.ok(gst >= 0 && gst < 2 * Math.PI);
});

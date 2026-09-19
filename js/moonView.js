/**
 * moonView.js
 * ---------------------------------------------------------------------------
 * Draws the Moon's illuminated shape in the SVG that already lives in
 * index.html. This module knows nothing about dates, geolocation or
 * astronomy formulas — it only turns an elongation angle into a polygon.
 * That separation is deliberate: astro.js can be tested and reasoned
 * about with no rendering concerns, and this module can be swapped or
 * restyled with no astronomy concerns.
 *
 * Model used: the standard orthographic-projection model of a lit sphere
 * (the same geometry behind the illuminated-fraction formula, not an
 * approximation of it). The lit region's boundary is made of two curves
 * from pole to pole:
 *   - the "limb" curve: the real edge of the disc, on whichever side is
 *     illuminated (right while waxing, left while waning).
 *   - the "terminator" curve: an ellipse arc whose horizontal half-width
 *     is R*cos(elongation). Its x-position is exactly cos(elongation)
 *     times the limb's x-position at the same height, which is what
 *     makes the enclosed area equal to (1 - cos(elongation)) / 2 of the
 *     full disc — matching moonPhase().illumination exactly (see
 *     tests/astro.test.mjs's rendering-area check and README.md).
 *
 * At elongation = 90/270 degrees this collapses to a straight vertical
 * line (cos = 0) — correct: a real quarter Moon has a straight
 * terminator, not a curved one.
 */

const RAD = Math.PI / 180;

/** Points used to approximate each half of the boundary. Smooth enough
 *  at any on-screen size while staying cheap to recompute on every
 *  slider tick. */
const STEPS = 48;

/**
 * @param {SVGPolygonElement} polygonEl  the <polygon> inside the SVG
 *   <clipPath> that masks the "lit" layer
 * @param {number} radius  matches the radius used in the SVG markup
 * @param {number} centerX  matches the SVG circle's center x
 * @param {number} centerY  matches the SVG circle's center y
 */
export function createMoonRenderer(polygonEl, radius, centerX, centerY) {
  return function render(elongationDeg) {
    const normalized = ((elongationDeg % 360) + 360) % 360;
    const theta = normalized * RAD;
    const waxing = normalized <= 180;
    const limbSign = waxing ? 1 : -1;
    const cosT = Math.cos(theta);

    const points = [];

    // Limb side: trace the real disc edge, top pole to bottom pole.
    for (let i = 0; i <= STEPS; i++) {
      const y = -radius + (2 * radius * i) / STEPS;
      const x = limbSign * Math.sqrt(Math.max(0, radius * radius - y * y));
      points.push(`${centerX + x},${centerY + y}`);
    }

    // Terminator side: bottom pole back to top pole, closing the loop.
    for (let i = 0; i <= STEPS; i++) {
      const y = radius - (2 * radius * i) / STEPS;
      const x = cosT * limbSign * Math.sqrt(Math.max(0, radius * radius - y * y));
      points.push(`${centerX + x},${centerY + y}`);
    }

    polygonEl.setAttribute("points", points.join(" "));
  };
}

/**
 * Standalone helper (used by tests) that returns the same boundary as an
 * array of [x, y] points local to the disc's own center, so the enclosed
 * area can be checked against moonPhase().illumination without touching
 * the DOM at all.
 */
export function moonBoundaryPoints(elongationDeg, radius, steps = STEPS) {
  const normalized = ((elongationDeg % 360) + 360) % 360;
  const theta = normalized * RAD;
  const waxing = normalized <= 180;
  const limbSign = waxing ? 1 : -1;
  const cosT = Math.cos(theta);

  const points = [];
  for (let i = 0; i <= steps; i++) {
    const y = -radius + (2 * radius * i) / steps;
    const x = limbSign * Math.sqrt(Math.max(0, radius * radius - y * y));
    points.push([x, y]);
  }
  for (let i = 0; i <= steps; i++) {
    const y = radius - (2 * radius * i) / steps;
    const x = cosT * limbSign * Math.sqrt(Math.max(0, radius * radius - y * y));
    points.push([x, y]);
  }
  return points;
}

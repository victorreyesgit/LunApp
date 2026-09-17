/**
 * moonView.js
 * ---------------------------------------------------------------------------
 * Draws the Moon's illuminated shape in the SVG that already lives in
 * index.html. This module knows nothing about dates, geolocation or
 * astronomy formulas — it only turns an elongation angle into a clip
 * circle position. That separation is deliberate: astro.js can be tested
 * and reasoned about with no rendering concerns, and this module can be
 * swapped or restyled with no astronomy concerns.
 *
 * Model used: the illuminated region is the geometric intersection of
 * two equal circles (the Moon's disc, fixed; and a "light" disc that
 * slides left/right as the phase advances). This is the same
 * construction behind most simple CSS/SVG moon-phase widgets. It is a
 * good visual approximation, not a physically exact projection of the
 * terminator ellipse — see README.md.
 */

const RAD = Math.PI / 180;

/**
 * @param {SVGCircleElement} clipCircleEl  the <circle> inside the SVG
 *   <clipPath> that masks the "lit" layer
 * @param {number} radius  matches the radius used in the SVG markup
 * @param {number} centerX  matches the SVG's circle center x
 */
export function createMoonRenderer(clipCircleEl, radius, centerX) {
  return function render(elongationDeg) {
    const theta = ((elongationDeg % 360) + 360) % 360 * RAD;
    const waxing = elongationDeg <= 180;
    const sign = waxing ? 1 : -1;
    const dx = sign * radius * (1 + Math.cos(theta));
    clipCircleEl.setAttribute("cx", String(centerX + dx));
  };
}

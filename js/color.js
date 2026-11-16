/**
 * Color parsing and WCAG 2.x contrast math.
 *
 * Pure functions with no DOM access, so they run in Node's test runner as well
 * as the browser.
 * @module color
 */

/**
 * @typedef {object} Rgba
 * @property {number} r red, 0-255
 * @property {number} g green, 0-255
 * @property {number} b blue, 0-255
 * @property {number} a alpha, 0-1
 */

/** Text colors the app chooses between when text color is automatic. */
export const LIGHT_TEXT = "#ffffff";
export const DARK_TEXT = "#141414";

/** Linear-light value of each 8-bit sRGB channel, precomputed once. */
const LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Clamp a number into a range.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Parse one rgb() channel token: a number, or a percentage of `max`.
 * @param {string} token
 * @param {number} max 255 for color channels, 1 for alpha
 * @returns {number} NaN when the token isn't numeric
 */
function channel(token, max) {
  const value = parseFloat(token);
  if (Number.isNaN(value)) return NaN;
  const scaled = token.endsWith("%") ? (value / 100) * max : value;
  return clamp(scaled, 0, max);
}

/**
 * Parse a CSS hex or rgb()/rgba() color.
 * Accepts #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(r g b / a) and rgba(r, g, b, a).
 * @param {unknown} input
 * @returns {Rgba | null} null when the value isn't a color this parser knows
 */
export function parseColor(input) {
  if (typeof input !== "string") return null;
  const text = input.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join("");
    const byte = (i) => parseInt(digits.slice(i, i + 2), 16);
    const a = digits.length === 8 ? Math.round((byte(6) / 255) * 1000) / 1000 : 1;
    return { r: byte(0), g: byte(2), b: byte(4), a };
  }

  const fn = /^rgba?\(\s*([^)]+)\)$/.exec(text);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length !== 3 && parts.length !== 4) return null;
    const [r, g, b] = parts.slice(0, 3).map((p) => channel(p, 255));
    const a = parts.length === 4 ? channel(parts[3], 1) : 1;
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a };
  }
  return null;
}

/**
 * Format a color as #rrggbb, or #rrggbbaa when it is translucent.
 * @param {Rgba} color
 * @returns {string}
 */
export function toHex({ r, g, b, a = 1 }) {
  const byte = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}${a < 1 ? byte(a * 255) : ""}`;
}

/**
 * Format a color as rgba() for canvas fill and stroke styles.
 * @param {Rgba} color
 * @returns {string}
 */
export function toCss({ r, g, b, a = 1 }) {
  return `rgba(${r}, ${g}, ${b}, ${Math.round(clamp(a, 0, 1) * 1000) / 1000})`;
}

/**
 * WCAG relative luminance of 8-bit sRGB channels (no bounds checks; hot path).
 * @param {number} r 0-255 integer
 * @param {number} g 0-255 integer
 * @param {number} b 0-255 integer
 * @returns {number} 0 (black) to 1 (white)
 */
export function luminanceOfPixel(r, g, b) {
  return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
}

/**
 * WCAG relative luminance of a parsed color. Alpha is ignored.
 * @param {Rgba} color
 * @returns {number}
 */
export function relativeLuminance({ r, g, b }) {
  const idx = (v) => Math.round(clamp(v, 0, 255));
  return luminanceOfPixel(idx(r), idx(g), idx(b));
}

/**
 * WCAG contrast ratio between two luminances, from 1:1 up to 21:1.
 * @param {number} l1
 * @param {number} l2
 * @returns {number}
 */
export function contrastRatio(l1, l2) {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

const LUMINANCE_LIGHT = relativeLuminance(parseColor(LIGHT_TEXT));
const LUMINANCE_DARK = relativeLuminance(parseColor(DARK_TEXT));

/**
 * Pick light or dark text for a backdrop and report the resulting contrast.
 *
 * A backdrop under text is rarely one flat color, so it is described by the
 * luminance of its darkest and lightest parts. Light text is limited by the
 * lightest part and dark text by the darkest, so each candidate is scored
 * against its own worst case.
 *
 * @param {{min: number, max: number}} range backdrop luminance at its dark and light ends
 * @param {"auto" | "light" | "dark"} [mode] "auto" picks the higher worst-case contrast
 * @returns {{color: string, ratio: number}}
 */
export function pickTextColor(range, mode = "auto") {
  const light = contrastRatio(LUMINANCE_LIGHT, range.max);
  const dark = contrastRatio(LUMINANCE_DARK, range.min);
  if (mode === "light" || (mode === "auto" && light >= dark)) {
    return { color: LIGHT_TEXT, ratio: light };
  }
  return { color: DARK_TEXT, ratio: dark };
}

/**
 * Describe a contrast ratio against WCAG 2.1 success criterion 1.4.3.
 * @param {number} ratio
 * @returns {"AAA" | "AA" | "AA large" | "fail"}
 */
export function wcagRating(ratio) {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA large";
  return "fail";
}

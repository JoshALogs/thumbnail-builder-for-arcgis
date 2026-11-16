/**
 * Theme packs.
 *
 * A pack is a JSON file listing color themes, optionally with a default logo
 * and background image per theme. The app ships one pack (themes/default.json)
 * and can load more from any URL that allows cross-origin requests, which is
 * how an organization adds its own branding without changing this code.
 * @module themes
 */
import { parseColor, toCss } from "./color.js";

/** URL of the pack bundled with the app. */
export const BUILTIN_PACK_URL = new URL("../themes/default.json", import.meta.url).href;

/**
 * @typedef {object} Theme
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} canvas base color (CSS rgba)
 * @property {string} accent band and panel color
 * @property {string} chip chip background
 * @property {string} patternColor contour line color
 * @property {"contours" | "none"} pattern
 * @property {string} logo default logo URL, or ""
 * @property {string} background default background URL, or ""
 */

/**
 * Trimmed string capped at `max` characters, or "" for non-strings.
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Resolve an asset path against the pack's URL. Only http(s) results are kept.
 * @param {unknown} value
 * @param {string} baseUrl
 * @returns {string}
 */
function assetUrl(value, baseUrl) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim(), baseUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

/**
 * Validate one theme entry. Invalid colors fall back to safe defaults.
 * @param {any} raw
 * @param {string} baseUrl
 * @returns {Theme | null}
 */
function normalizeTheme(raw, baseUrl) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(raw.id)) return null;
  const color = (value, fallback) => {
    const parsed = parseColor(value);
    return parsed ? toCss(parsed) : fallback;
  };
  return {
    id: raw.id,
    name: text(raw.name, 40) || raw.id,
    description: text(raw.description, 120),
    canvas: color(raw.canvas, "rgba(20, 32, 48, 1)"),
    accent: color(raw.accent, "rgba(0, 122, 194, 0.92)"),
    chip: color(raw.chip, "rgba(0, 0, 0, 0.55)"),
    patternColor: color(raw.patternColor, "rgba(255, 255, 255, 0.14)"),
    pattern: raw.pattern === "none" ? "none" : "contours",
    logo: assetUrl(raw.logo, baseUrl),
    background: assetUrl(raw.background, baseUrl),
  };
}

/**
 * Validate a parsed pack.
 * @param {any} json
 * @param {string} baseUrl URL the pack came from, for resolving asset paths
 * @returns {{name: string, themes: Theme[]}}
 * @throws {Error} when the JSON has no usable themes
 */
export function normalizePack(json, baseUrl) {
  if (!json || !Array.isArray(json.themes)) {
    throw new Error("That file isn't a theme pack: it has no \"themes\" list.");
  }
  const seen = new Set();
  const themes = [];
  for (const raw of json.themes.slice(0, 50)) {
    const theme = normalizeTheme(raw, baseUrl);
    if (theme && !seen.has(theme.id)) {
      seen.add(theme.id);
      themes.push(theme);
    }
  }
  if (!themes.length) throw new Error("That theme pack has no usable themes.");
  return { name: text(json.name, 80) || "Theme pack", themes };
}

/**
 * Fetch and validate a theme pack.
 * @param {string} url
 * @returns {Promise<{name: string, themes: Theme[]}>}
 */
export async function loadThemePack(url) {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`The theme pack couldn't be loaded (HTTP ${res.status}).`);
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error("The theme pack isn't valid JSON.");
  }
  return normalizePack(json, res.url || url);
}

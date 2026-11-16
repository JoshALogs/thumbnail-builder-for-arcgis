/**
 * Calcite UI icons as canvas paths.
 *
 * Each icon on Esri's CDN is a JSON file holding SVG path data for a 24x24
 * grid, which Path2D draws directly. Icons are fetched on demand and cached.
 * @module icons
 */
import { CALCITE_CDN } from "./config.js";

/** @type {Map<string, Promise<Path2D | null>>} */
const cache = new Map();

/**
 * Asset file stem for an icon name: "feature-layer" becomes "featureLayer".
 * @param {string} name kebab-case Calcite icon name
 * @returns {string}
 */
export function iconFileStem(name) {
  return name.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

/**
 * Turn icon JSON (a path string, or a list of paths) into one Path2D.
 * @param {unknown} data
 * @returns {Path2D | null}
 */
function toPath(data) {
  if (typeof data === "string") return new Path2D(data);
  if (Array.isArray(data)) {
    const path = new Path2D();
    for (const part of data) {
      const d = typeof part === "string" ? part : part?.path;
      if (typeof d === "string") path.addPath(new Path2D(d));
    }
    return path;
  }
  return null;
}

/**
 * Load a 24px Calcite icon. Resolves to null when the icon can't be loaded, so
 * a missing icon never blocks rendering.
 * @param {string | null} name
 * @returns {Promise<Path2D | null>}
 */
export function loadIcon(name) {
  if (!name) return Promise.resolve(null);
  if (!cache.has(name)) {
    const url = `${CALCITE_CDN}/assets/icon/${iconFileStem(name)}24.json`;
    cache.set(
      name,
      fetch(url)
        .then((res) => (res.ok ? res.json() : null))
        .then(toPath)
        .catch(() => null),
    );
  }
  return cache.get(name);
}

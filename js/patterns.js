/**
 * Procedural background patterns.
 *
 * The contour pattern draws topographic lines over a seeded random terrain, so
 * a thumbnail without a photo still reads as "map" and stays sharp at any
 * pixel density. Geometry is cached per size and seed.
 * @module patterns
 */

/** @type {Map<string, {minor: Path2D, index: Path2D}>} */
const cache = new Map();

/** Grid spacing for terrain sampling, in output pixels. */
const STEP = 8;

/** Number of contour intervals across the terrain's height range. */
const LEVELS = 24;

/**
 * Deterministic pseudo-random generator (mulberry32).
 * @param {number} seed 32-bit integer
 * @returns {() => number} returns floats in [0, 1)
 */
export function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash a string to a 32-bit seed (FNV-1a).
 * @param {string} text
 * @returns {number}
 */
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Where the contour level crosses the edge between two corner values, as a
 * fraction of the edge length.
 * @param {number} v0
 * @param {number} v1
 * @param {number} level
 * @returns {number}
 */
function crossing(v0, v1, level) {
  const d = v1 - v0;
  return d === 0 ? 0.5 : (level - v0) / d;
}

/**
 * Trace one contour level with marching squares, appending line segments.
 * Corner bits: top-left 8, top-right 4, bottom-right 2, bottom-left 1.
 * @param {Float64Array} grid terrain samples, row-major
 * @param {number} cols
 * @param {number} rows
 * @param {number} level
 * @param {Path2D} path
 */
function traceLevel(grid, cols, rows, level, path) {
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = grid[j * cols + i];
      const b = grid[j * cols + i + 1];
      const c = grid[(j + 1) * cols + i + 1];
      const d = grid[(j + 1) * cols + i];
      const cell = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (cell === 0 || cell === 15) continue;

      const x = i * STEP;
      const y = j * STEP;
      const top = () => [x + STEP * crossing(a, b, level), y];
      const right = () => [x + STEP, y + STEP * crossing(b, c, level)];
      const bottom = () => [x + STEP * crossing(d, c, level), y + STEP];
      const left = () => [x, y + STEP * crossing(a, d, level)];
      const seg = (p, q) => {
        path.moveTo(p[0], p[1]);
        path.lineTo(q[0], q[1]);
      };

      switch (cell) {
        case 1: case 14: seg(left(), bottom()); break;
        case 2: case 13: seg(bottom(), right()); break;
        case 3: case 12: seg(left(), right()); break;
        case 4: case 11: seg(top(), right()); break;
        case 6: case 9: seg(top(), bottom()); break;
        case 7: case 8: seg(left(), top()); break;
        case 5: seg(left(), top()); seg(bottom(), right()); break; // saddle
        case 10: seg(left(), bottom()); seg(top(), right()); break; // saddle
      }
    }
  }
}

/**
 * Contour line paths for a box of the given size. Every fifth line is an
 * "index contour", drawn heavier, as on a topographic map.
 * @param {number} width output pixels
 * @param {number} height output pixels
 * @param {number} seed
 * @returns {{minor: Path2D, index: Path2D}}
 */
export function contourPaths(width, height, seed) {
  const key = `${width}x${height}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rand = seededRandom(seed);
  const span = Math.max(width, height);
  // Terrain: a few Gaussian hills and hollows on a gentle tilt.
  const bumps = Array.from({ length: 7 }, () => ({
    x: rand() * width,
    y: rand() * height,
    s: (0.12 + rand() * 0.22) * span,
    h: (rand() < 0.3 ? -1 : 1) * (0.5 + rand()),
  }));
  const tiltX = (rand() - 0.5) * 0.6;
  const tiltY = (rand() - 0.5) * 0.6;

  const cols = Math.ceil(width / STEP) + 1;
  const rows = Math.ceil(height / STEP) + 1;
  const grid = new Float64Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * STEP;
      const y = j * STEP;
      let v = tiltX * (x / width) + tiltY * (y / height);
      for (const bump of bumps) {
        const dx = x - bump.x;
        const dy = y - bump.y;
        v += bump.h * Math.exp(-(dx * dx + dy * dy) / (2 * bump.s * bump.s));
      }
      grid[j * cols + i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  const minor = new Path2D();
  const index = new Path2D();
  for (let k = 1; k < LEVELS; k++) {
    const level = min + ((max - min) * k) / LEVELS;
    traceLevel(grid, cols, rows, level, k % 5 === 0 ? index : minor);
  }

  const paths = { minor, index };
  cache.set(key, paths);
  return paths;
}

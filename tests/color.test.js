import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DARK_TEXT,
  LIGHT_TEXT,
  contrastRatio,
  parseColor,
  pickTextColor,
  relativeLuminance,
  toCss,
  toHex,
  wcagRating,
} from "../js/color.js";

const near = (actual, expected, tolerance = 1e-9) => Math.abs(actual - expected) <= tolerance;

test("parseColor reads hex forms", () => {
  assert.deepEqual(parseColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor("#007AC2"), { r: 0, g: 122, b: 194, a: 1 });
  assert.deepEqual(parseColor("#007ac280"), { r: 0, g: 122, b: 194, a: 0.502 });
  assert.deepEqual(parseColor("#0008"), { r: 0, g: 0, b: 0, a: 0.533 });
});

test("parseColor reads rgb() and rgba()", () => {
  assert.deepEqual(parseColor("rgb(10, 20, 30)"), { r: 10, g: 20, b: 30, a: 1 });
  assert.deepEqual(parseColor("rgba(10, 20, 30, 0.5)"), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseColor("rgb(10 20 30 / 50%)"), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseColor("rgb(100%, 0%, 50%)"), { r: 255, g: 0, b: 128, a: 1 });
});

test("parseColor rejects anything it doesn't understand", () => {
  for (const bad of ["", "red", "#12345", "rgb(1, 2)", "rgb(a, b, c)", null, 42]) {
    assert.equal(parseColor(bad), null, String(bad));
  }
});

test("toHex keeps alpha only when the color is translucent", () => {
  assert.equal(toHex(parseColor("#007ac2")), "#007ac2");
  assert.equal(toHex(parseColor("#007ac2eb")), "#007ac2eb");
  assert.equal(toCss({ r: 1, g: 2, b: 3, a: 0.5 }), "rgba(1, 2, 3, 0.5)");
});

test("contrast ratios match WCAG reference values", () => {
  const white = relativeLuminance(parseColor("#ffffff"));
  const black = relativeLuminance(parseColor("#000000"));
  assert.ok(near(contrastRatio(white, black), 21));
  assert.ok(near(contrastRatio(black, black), 1));
  // #767676 on white is the well-known lightest gray that passes AA (4.54:1).
  const gray = relativeLuminance(parseColor("#767676"));
  assert.ok(near(contrastRatio(white, gray), 4.54, 0.01));
});

test("pickTextColor scores each candidate against its own worst case", () => {
  assert.equal(pickTextColor({ min: 0.01, max: 0.05 }).color, LIGHT_TEXT);
  assert.equal(pickTextColor({ min: 0.8, max: 0.95 }).color, DARK_TEXT);
  // A forced mode is honored, and its (poor) contrast is reported honestly.
  const forced = pickTextColor({ min: 0.8, max: 0.95 }, "light");
  assert.equal(forced.color, LIGHT_TEXT);
  assert.ok(forced.ratio < 1.2);
});

test("wcagRating thresholds", () => {
  assert.equal(wcagRating(7.1), "AAA");
  assert.equal(wcagRating(4.5), "AA");
  assert.equal(wcagRating(3.2), "AA large");
  assert.equal(wcagRating(2.9), "fail");
});

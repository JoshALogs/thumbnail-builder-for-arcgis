import { test } from "node:test";
import assert from "node:assert/strict";
import { ellipsize, fitText, wrapText } from "../js/text.js";

/** Stand-in for canvas measureText: every character is half the font size wide. */
const measure = (text, size) => text.length * size * 0.5;

test("wrapText breaks lines at spaces", () => {
  assert.deepEqual(wrapText("one two three", 40, 10, measure), ["one two", "three"]);
});

test("wrapText hard-breaks a word longer than a line", () => {
  assert.deepEqual(wrapText("abcdefghij", 20, 10, measure), ["abcd", "efgh", "ij"]);
});

test("fitText steps the size down until the text fits", () => {
  const fit = fitText(
    "Regional Trail Network",
    { w: 200, h: 100 },
    { maxSize: 40, minSize: 10, lineHeight: 1, maxLines: 2 },
    measure,
  );
  assert.equal(fit.size, 30);
  assert.deepEqual(fit.lines, ["Regional", "Trail Network"]);
  assert.equal(fit.truncated, false);
});

test("fitText ends on an ellipsis when even the minimum size overflows", () => {
  const fit = fitText(
    "a b c d e f g h",
    { w: 10, h: 10 },
    { maxSize: 10, minSize: 10, lineHeight: 1, maxLines: 1 },
    measure,
  );
  assert.equal(fit.truncated, true);
  assert.deepEqual(fit.lines, ["a…"]);
});

test("fitText returns no lines for blank text", () => {
  assert.deepEqual(fitText("   ", { w: 100, h: 100 }, { maxSize: 20, minSize: 10 }, measure).lines, []);
});

test("ellipsize keeps as much text as fits", () => {
  assert.equal(ellipsize("abcdefgh", 25, 10, measure), "abcd…");
});

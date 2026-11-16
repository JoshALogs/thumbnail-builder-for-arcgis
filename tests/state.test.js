import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, fromSearchParams, isHttpUrl, normalizeAccent, toSearchParams } from "../js/state.js";
import { layoutKind } from "../js/layouts.js";

test("default settings produce an empty query string", () => {
  assert.equal(toSearchParams(DEFAULT_STATE).toString(), "");
});

test("every setting survives a round trip through a share link", () => {
  const state = {
    ...DEFAULT_STATE,
    kind: "group",
    groupLayout: "group-badge",
    theme: "forest",
    pack: "https://example.org/themes.json",
    title: "Bike Lanes",
    category: "",
    showIcon: false,
    accent: "#2c6b48f0",
    textMode: "dark",
    scrim: 0.3,
    logoScale: 1.5,
    focusX: 0.25,
    focusY: 0.75,
    background: "https://example.org/photo.jpg",
    logo: "https://example.org/logo.png",
  };
  assert.deepEqual(fromSearchParams(toSearchParams(state), layoutKind), state);
});

test("a layout in the link implies its thumbnail kind", () => {
  const s = fromSearchParams(new URLSearchParams("layout=group-badge"), layoutKind);
  assert.equal(s.kind, "group");
  assert.equal(s.groupLayout, "group-badge");
});

test("invalid values fall back to the defaults", () => {
  const query =
    "kind=poster&layout=nope&theme=<script>&icon=maybe&accent=notacolor&text=neon" +
    "&scrim=abc&focus=1,2,3&background=javascript:alert(1)&logo=ftp://x/y.png";
  assert.deepEqual(fromSearchParams(new URLSearchParams(query), layoutKind), { ...DEFAULT_STATE });
});

test("numbers are clamped to their ranges", () => {
  const s = fromSearchParams(new URLSearchParams("scrim=500&logoScale=1&focus=-20,180"));
  assert.equal(s.scrim, 0.8);
  assert.equal(s.logoScale, 0.5);
  assert.equal(s.focusX, 0);
  assert.equal(s.focusY, 1);
});

test("text from a link is length-limited", () => {
  const s = fromSearchParams(new URLSearchParams(`title=${"x".repeat(500)}`));
  assert.equal(s.title.length, 200);
});

test("isHttpUrl accepts only absolute http and https URLs", () => {
  assert.equal(isHttpUrl("https://example.org/a.png"), true);
  assert.equal(isHttpUrl("http://localhost:5181/x"), true);
  for (const bad of ["", "data:image/png;base64,AAAA", "javascript:alert(1)", "/relative.png", "blob:https://x/y", 7]) {
    assert.equal(isHttpUrl(bad), false, String(bad));
  }
});

test("normalizeAccent", () => {
  assert.equal(normalizeAccent("#ABC"), "#aabbcc");
  assert.equal(normalizeAccent("rgba(0, 122, 194, 0.5)"), "#007ac280");
  assert.equal(normalizeAccent("nope"), "");
});

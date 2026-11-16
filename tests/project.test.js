/**
 * Checks on the project's data files: layouts, the built-in theme pack, file
 * naming, and version strings that live in more than one place.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LAYOUTS, layoutsFor } from "../js/layouts.js";
import { CONDITIONS, LAYER_TYPES } from "../js/renderer.js";
import { normalizePack } from "../js/themes.js";
import { makeFilename } from "../js/exporter.js";
import { APP_VERSION, CALCITE_VERSION } from "../js/config.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("layouts use known layer types and conditions", () => {
  for (const layout of LAYOUTS) {
    for (const layer of layout.layers) {
      assert.ok(LAYER_TYPES.includes(layer.type), `${layout.id}: unknown layer type ${layer.type}`);
      for (const condition of [].concat(layer.when ?? [])) {
        assert.ok(CONDITIONS.includes(condition), `${layout.id}: unknown condition ${condition}`);
      }
    }
  }
});

test("layout ids are unique and each kind has layouts", () => {
  assert.equal(new Set(LAYOUTS.map((l) => l.id)).size, LAYOUTS.length);
  assert.ok(layoutsFor("item").length > 0);
  assert.ok(layoutsFor("group").length > 0);
});

test("layer boxes stay inside the canvas", () => {
  for (const layout of LAYOUTS) {
    const [W, H] = layout.size;
    for (const layer of layout.layers) {
      if (!layer.box) continue;
      const [x, y, w, h] = layer.box;
      assert.ok(x >= 0 && y >= 0 && x + w <= W && y + h <= H, `${layout.id}: ${layer.type} box ${layer.box}`);
    }
  }
});

test("the built-in theme pack is valid", async () => {
  const json = JSON.parse(await read("../themes/default.json"));
  const pack = normalizePack(json, "https://example.org/themes/default.json");
  assert.equal(pack.themes.length, json.themes.length);
  assert.equal(pack.themes[0].id, "calcite");
});

test("theme pack asset paths resolve against the pack URL; only http(s) survives", () => {
  const pack = normalizePack(
    { themes: [{ id: "org", logo: "logos/org.png", background: "javascript:alert(1)", accent: "#123456" }] },
    "https://example.org/brand/themes.json",
  );
  assert.equal(pack.themes[0].logo, "https://example.org/brand/logos/org.png");
  assert.equal(pack.themes[0].background, "");
  assert.equal(pack.themes[0].accent, "rgba(18, 52, 86, 1)");
});

test("bad themes are skipped and bad colors fall back", () => {
  const pack = normalizePack({ themes: [{ id: "ok", canvas: "not a color" }, { id: "bad id!" }, null, { id: "ok" }] }, "https://example.org/");
  assert.deepEqual(pack.themes.map((t) => t.id), ["ok"]);
  assert.equal(pack.themes[0].canvas, "rgba(20, 32, 48, 1)");
});

test("a file without usable themes is rejected", () => {
  assert.throws(() => normalizePack({}, "https://example.org/"), /no "themes" list/);
  assert.throws(() => normalizePack({ themes: [{ id: "!" }] }, "https://example.org/"), /no usable themes/);
});

test("download names never start with a digit", () => {
  assert.equal(makeFilename("Regional Trail Network", "item"), "Thumbnail_Regional_Trail_Network.png");
  assert.equal(makeFilename("2026 Paving Plan: Phase 2", "group"), "Group_Thumbnail_2026_Paving_Plan_Phase_2.png");
  assert.equal(makeFilename("Café façade survey", "item"), "Thumbnail_Cafe_Facade_Survey.png");
  assert.equal(makeFilename("GIS data (QA)", "item"), "Thumbnail_GIS_Data_QA.png");
  assert.equal(makeFilename("   ", "item"), "Thumbnail.png");
});

test("index.html loads the Calcite version that config.js expects", async () => {
  const html = await read("../index.html");
  const versions = [...html.matchAll(/calcite-components\/(\d+\.\d+\.\d+)\//g)].map((m) => m[1]);
  assert.equal(versions.length, 2, "expected the Calcite stylesheet and script");
  for (const version of versions) assert.equal(version, CALCITE_VERSION);
});

test("package.json and config.js agree on the app version", async () => {
  assert.equal(JSON.parse(await read("../package.json")).version, APP_VERSION);
});

# Thumbnail Builder for ArcGIS

Make consistent, accessible item and group thumbnails for ArcGIS Online and ArcGIS Enterprise. It runs entirely in your browser: no sign-in, no server, and images you upload never leave your device.

> Independent open-source project. Not made or endorsed by Esri. ArcGIS is a trademark of Esri.

## Features

- **Item (600 × 400) and group (400 × 400) thumbnails**: three item layouts (Banner, Panel, Poster) and two group layouts (Banner, Badge), each previewed live with your content.
- **Themes and theme packs**: five built-in themes, plus any number from a theme pack, a small JSON file that adds an organization's colors, logo, and background without touching the code.
- **Contrast checking**: the title and label are measured against the actual pixels behind them using the WCAG 2.1 contrast formula. Auto text color picks light or dark, whichever reads better, and a notice explains how to fix anything below 4.5:1.
- **Contour backgrounds**: without a photo, the theme draws a seeded topographic pattern, sharp at any size.
- **Item type labels** with matching Calcite icons, or any label you type.
- **Image controls**: crop focus, shade over the image, logo size, and a band color with transparency. Logos are trimmed of transparent padding automatically.
- **Several ways to add images**: upload, drag onto the preview, paste with Ctrl+V, or link a URL.
- **Export**: download a PNG at exact size, copy it to the clipboard, use the share sheet on phones, or copy a link that reopens the same settings.
- **Calcite Design System** interface with light and dark modes. It works from phone width up.

## Use it

1. Type the title. For items, pick an item type label.
2. Pick a layout and a theme. Add a background photo or logo if you have one.
3. Check that the contrast chip says WCAG AA or better.
4. Download the PNG. In ArcGIS, open the item or group page, choose **Edit thumbnail**, and upload it.

## Run it locally

There's no build step. Any static file server works; the repo includes a dependency-free one (Node 20 or later):

```bash
npm run serve
```

Then open <http://localhost:5181>. VS Code's Live Server extension works too. Opening `index.html` straight from disk doesn't, because browsers block ES modules on `file://`.

Run the tests (Node's built-in runner, no dependencies):

```bash
npm test
```

## Theme packs

A theme pack is a JSON file with a list of themes. Colors take hex (`#rrggbb` or `#rrggbbaa`) or `rgb()`/`rgba()`. Asset paths may be relative to the pack's own URL.

```json
{
  "name": "Example Agency",
  "themes": [
    {
      "id": "example-blue",
      "name": "Example Blue",
      "description": "Primary brand",
      "canvas": "#0b2540",
      "accent": "#0067b1eb",
      "chip": "#081a2dbf",
      "patternColor": "#ffffff26",
      "pattern": "contours",
      "logo": "logos/example.png",
      "background": "photos/skyline.jpg"
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `id` | Letters, digits, and hyphens. Used in share links. |
| `name`, `description` | Shown on the theme tile. |
| `canvas` | Base color behind everything. |
| `accent` | Title band, panel, and tint color. Transparency is allowed. |
| `chip` | Background of the item type chip. |
| `patternColor` | Contour line color. Set `"pattern": "none"` to turn the lines off. |
| `logo`, `background` | Optional default images (http or https). |

Host the pack anywhere that allows cross-origin requests (GitHub Pages does). Load it from the Theme section, or add `?pack=<url>` to a link so everyone who opens it gets the same themes. Themes from a pack replace built-in themes with the same `id`.

## Layouts

Layouts are plain data in [`js/layouts.js`](js/layouts.js): an output size and a stack of layers drawn bottom to top. Coordinates are output pixels, and values starting with `$` (such as `$accent`) come from the current theme and settings. Layer types are `fill`, `circle`, `pattern`, `image`, `gradient`, `text`, `chip`, `rule`, and `logo`. A layer's `when` list (`background`, `noBackground`, `logo`, `noLogo`, `category`, `noCategory`) controls whether it draws. To add a layout, add an entry; `npm test` checks that its layer types, conditions, and boxes are valid.

## Accessibility

The target is WCAG 2.1 AA.

- Controls are Calcite components with visible labels, and the page has landmarks, a heading structure, and skip links.
- Everything works from the keyboard. Changes that aren't visible as text (layout, theme, images) are announced to screen readers.
- The preview has a text description that updates with the content.
- The layout reflows to a single column on narrow screens, and light and dark modes follow the system or a toggle.
- The contrast check covers the thumbnail itself, since a thumbnail is an image of text.

## Project structure

```text
index.html          Page structure (Calcite components)
css/app.css         Layout for phone and desktop
css/fonts.css       Bundled Open Sans
js/main.js          Wires controls to state; preview, tiles, export
js/renderer.js      Draws a layout onto a canvas; measures contrast
js/layouts.js       Layout definitions (data)
js/themes.js        Theme pack loading and validation
js/state.js         Defaults, validation, share-link format
js/color.js         Color parsing and WCAG contrast math
js/text.js          Word wrap and auto-fit
js/patterns.js      Contour background generator
js/images.js        Image loading, logo trimming
js/icons.js         Calcite icons as canvas paths
js/exporter.js      PNG, clipboard, share, file names
themes/default.json Built-in theme pack
tests/              Node test runner tests
tools/serve.mjs     Local static server
```

## AI disclosure

The code in this repository was written with an AI coding assistant (Claude, by Anthropic) under human direction and oversight. No generative image models were used. Everything in a thumbnail is drawn by this code or comes from images you supply, Esri's Calcite icons, or the Open Sans font.

## License

The code and content in this repository are released under the [Zero-Clause BSD license](LICENSE) (0BSD): use, copy, modify, and distribute them for any purpose, with or without credit.

Third-party pieces keep their own terms:

- **Calcite Design System** (components and icons) by Esri is loaded at runtime from Esri's CDN and isn't included in this repository. It is free to use but licensed under Esri's terms, not an open-source license. See [Calcite's licensing](https://developers.arcgis.com/calcite-design-system/resources/licensing).
- **Open Sans** is licensed under the SIL Open Font License 1.1. See [`fonts/README.md`](fonts/README.md).

# Icons

These replace the old `assets/icons.js`. They come from the two icon packs you supplied
(441 web icons and 100 business icons), each cut out as its own 24x24 SVG.

- `pack/` all 541 icons, untouched, named `web-ROW-COL.svg` (441 set) and `biz-ROW-COL.svg` (100 set),
  where ROW/COL is the position on the original sheet.
- `<name>.svg` the icons the app uses (`home.svg`, `map-pin.svg`, ...). Same names the app used before.
- `sprite.svg` all named icons in one file; this is what the pages load.

## Use in HTML
    <svg class="icon"><use href="/assets/icons/sprite.svg#map-pin"/></svg>

Colour follows the text colour (`currentColor`); line weight is the `stroke-width` on the path inside each icon file; size comes from the `.icon` CSS as before.

## Change an icon
1. Copy a file from `pack/` over the named one (e.g. `pack/web-19-08.svg` -> `home.svg`),
   or add a new `my-icon.svg`.
2. Run `node tools/build-icons.js` to rebuild `sprite.svg`.

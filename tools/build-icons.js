// Rebuilds assets/icons/sprite.svg from the single-icon files in assets/icons/*.svg.
// Run after you add or swap an icon:  node tools/build-icons.js
const fs = require("fs"), path = require("path");
// Line weight: every icon's outline is multiplied by this when the sprite is built. 1 = as stored, 1.6 = bolder, 2 = heavy.
const WEIGHT = 1.3;
const dir = path.join(__dirname, "..", "assets", "icons");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".svg") && f !== "sprite.svg").sort();
const symbols = files.map(f => {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  const vb = (src.match(/viewBox="([^"]+)"/) || [, "0 0 24 24"])[1];
  const inner = src.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>[\s\S]*$/, "").trim()
    .replace(/stroke-width="([\d.]+)"/g, (m, w) => `stroke-width="${(w * WEIGHT).toFixed(2)}"`)
    .replace(/<path (?![^>]*stroke=)/g, '<path stroke="none" ').replace(/<path /g, '<path fill="currentColor" ');
  return `<symbol id="${f.slice(0, -4)}" viewBox="${vb}">${inner}</symbol>`;
});
fs.writeFileSync(path.join(dir, "sprite.svg"), `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join("\n")}\n</svg>\n`);
console.log(files.length + " icons written to assets/icons/sprite.svg");
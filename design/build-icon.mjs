// Rasterizes design/logo.svg with Resvg (transparent background) and packs
// PNG frames into src-tauri/icons/icon.ico. Tauri's built-in ICO encoder
// produced white anti-aliased fringes around the rounded corners, so we build
// the icon ourselves.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = fs.readFileSync(path.join(root, "design/logo-square.svg"));
const sizes = [16, 24, 32, 48, 64, 128, 256];

const frames = sizes.map((size) => {
  const renderer = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)",
  });
  return renderer.render().asPng();
});

const ico = await pngToIco(frames);
const target = path.join(root, "src-tauri/icons/icon.ico");
fs.writeFileSync(target, ico);

// tauri-build caches the embedded resource; bump build.rs so Cargo reruns it.
const buildRs = path.join(root, "src-tauri/build.rs");
const now = new Date();
fs.utimesSync(buildRs, now, now);

console.log(`wrote ${target} (${ico.length} bytes, ${sizes.join("/")})`);

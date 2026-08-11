/**
 * Validates public/logo.png against the idle screen.
 *
 * Three things have gone wrong with this asset already: it was missing, then it
 * was a JPEG under a .png name, and now the artwork carries its own background.
 * That last one is the awkward case — if the logo's background is even slightly
 * off from the canvas it sits on, a square appears around it on the lobby
 * screen and reads as a rendering fault.
 *
 * Run after replacing the artwork:  npm run check:logo
 */

import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const LOGO_PATH = "public/logo.png";
const CSS_PATH = "src/app/globals.css";

const PNG_SIGNATURE = "89504e470d0a1a0a";
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

interface Png {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
  palette: Buffer | null;
  hasTrns: boolean;
  pixels: Buffer;
}

function parsePng(buffer: Buffer): Png | null {
  if (buffer.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) return null;

  let offset = 8;
  let header: Omit<Png, "palette" | "hasTrns" | "pixels"> | null = null;
  let palette: Buffer | null = null;
  let hasTrns = false;
  const idat: Buffer[] = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") hasTrns = true;
    else if (type === "IEND") break;

    offset += 12 + length;
  }

  if (!header || idat.length === 0) return null;

  return { ...header, palette, hasTrns, pixels: inflateSync(Buffer.concat(idat)) };
}

/**
 * Top-left pixel.
 *
 * Only the very first pixel is needed, which avoids unfiltering the image:
 * on the first pixel of the first row every PNG filter reduces to the raw
 * bytes, because the left, above and above-left neighbours are all zero.
 */
function firstPixel(png: Png): { hex: string; alpha: number } | null {
  if (png.bitDepth !== 8) return null;

  const channels = CHANNELS[png.colorType];
  if (!channels) return null;

  const raw = png.pixels.subarray(1, 1 + channels);
  const toHex = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

  switch (png.colorType) {
    case 0:
      return { hex: toHex(raw[0], raw[0], raw[0]), alpha: 255 };
    case 4:
      return { hex: toHex(raw[0], raw[0], raw[0]), alpha: raw[1] };
    case 2:
      return { hex: toHex(raw[0], raw[1], raw[2]), alpha: 255 };
    case 6:
      return { hex: toHex(raw[0], raw[1], raw[2]), alpha: raw[3] };
    case 3: {
      if (!png.palette) return null;
      const i = raw[0] * 3;
      return { hex: toHex(png.palette[i], png.palette[i + 1], png.palette[i + 2]), alpha: 255 };
    }
    default:
      return null;
  }
}

function canvasColour(): string | null {
  const match = readFileSync(CSS_PATH, "utf8").match(
    /--color-brand-primary:\s*(#[0-9a-fA-F]{6})/,
  );
  return match ? match[1].toLowerCase() : null;
}

// --- report -----------------------------------------------------------------

let file: Buffer;
try {
  file = readFileSync(LOGO_PATH);
} catch {
  console.log(`FAIL  ${LOGO_PATH} is missing. The idle screen will fall back to type.`);
  process.exit(1);
}

const signature = file.subarray(0, 4).toString("hex");

if (signature === "ffd8ffe0" || signature === "ffd8ffe1") {
  console.log(`FAIL  ${LOGO_PATH} is a JPEG, not a PNG. JPEG cannot carry transparency.`);
  process.exit(1);
}

const png = parsePng(file);

if (!png) {
  console.log(`FAIL  ${LOGO_PATH} is not a readable PNG (signature ${signature}).`);
  process.exit(1);
}

console.log(`PNG    ${png.width}x${png.height}, bit depth ${png.bitDepth}, colour type ${png.colorType}`);
console.log(`       set <Image width={${png.width}} height={${png.height}}> in BrandLogo.tsx`);

if (png.interlace === 1) {
  console.log("WARN   interlaced PNG; the sampled corner pixel may not be the top-left one.");
}

const pixel = firstPixel(png);
const canvas = canvasColour();

console.log(`       idle canvas (--color-brand-primary) is ${canvas ?? "(not found in globals.css)"}`);

if (!pixel) {
  console.log("WARN   could not sample the corner pixel; check the background by eye.");
  process.exit(0);
}

if (pixel.alpha === 0) {
  console.log("OK     corner pixel is transparent — the artwork has no baked-in background,");
  console.log("       so it sits cleanly on any canvas colour.");
  process.exit(0);
}

console.log(`       logo corner pixel is ${pixel.hex} (alpha ${pixel.alpha})`);

if (canvas && pixel.hex === canvas) {
  console.log("OK     logo background matches the idle canvas exactly.");
  process.exit(0);
}

console.log("FAIL   the logo carries a solid background that does not match the canvas.");
console.log("       A square will be visible around it on the idle screen. Either:");
console.log(`         - set --color-brand-primary: ${pixel.hex}; in ${CSS_PATH}, or`);
console.log("         - re-export the logo with a transparent background.");
process.exit(1);

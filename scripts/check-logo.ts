/**
 * Validates the kiosk logo against the component that draws it.
 *
 * Five things have gone wrong with this asset now: it was missing, it was a
 * JPEG under a .png name, it gained a background that had to match the canvas,
 * next/image re-encoded that background into something slightly different, and
 * the export carried transparent margins that silently became layout.
 *
 * Each of those was invisible in the source file and obvious on the screen, so
 * this checks the whole path: the file, how it is delivered, and whether the
 * crop constants in BrandLogo still describe the artwork.
 *
 * Run after replacing the artwork:  npm run check:logo
 */

import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const CSS_PATH = "src/app/globals.css";
const LOGO_COMPONENT = "src/components/kiosk/BrandLogo.tsx";

const PNG_SIGNATURE = "89504e470d0a1a0a";
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/** Below this, a pixel is treated as transparent for bounding-box purposes. */
const ALPHA_FLOOR = 8;

interface Png {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
  palette: Buffer | null;
  ancillary: string[];
  raw: Buffer;
}

function parsePng(buffer: Buffer): Png | null {
  if (buffer.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) return null;

  let offset = 8;
  let header: Pick<Png, "width" | "height" | "bitDepth" | "colorType" | "interlace"> | null =
    null;
  let palette: Buffer | null = null;
  const ancillary: string[] = [];
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
    else if (type === "IEND") break;
    else if (["gAMA", "iCCP", "sRGB", "cHRM"].includes(type)) ancillary.push(type);

    offset += 12 + length;
  }

  if (!header || idat.length === 0) return null;
  return { ...header, palette, ancillary, raw: inflateSync(Buffer.concat(idat)) };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Reverse the per-scanline filters into a flat pixel buffer. */
function decode(png: Png): Buffer | null {
  if (png.bitDepth !== 8 || png.interlace !== 0) return null;
  const bpp = CHANNELS[png.colorType];
  if (!bpp) return null;

  const stride = png.width * bpp;
  const out = Buffer.alloc(stride * png.height);
  let pos = 0;

  for (let y = 0; y < png.height; y += 1) {
    const filter = png.raw[pos];
    pos += 1;
    const line = png.raw.subarray(pos, pos + stride);
    pos += stride;

    const rowStart = y * stride;
    const prevStart = rowStart - stride;

    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? out[rowStart + x - bpp] : 0;
      const b = y > 0 ? out[prevStart + x] : 0;
      const c = y > 0 && x >= bpp ? out[prevStart + x - bpp] : 0;

      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) value += paeth(a, b, c);

      out[rowStart + x] = value & 0xff;
    }
  }
  return out;
}

const hex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

const hasAlpha = (colorType: number) => colorType === 6 || colorType === 4;

function alphaAt(png: Png, pixels: Buffer, x: number, y: number): number {
  if (!hasAlpha(png.colorType)) return 255;
  const bpp = CHANNELS[png.colorType];
  return pixels[y * png.width * bpp + x * bpp + bpp - 1];
}

/** The rectangle actually occupied by visible artwork. */
function boundingBox(png: Png, pixels: Buffer) {
  let minX = png.width;
  let maxX = -1;
  let minY = png.height;
  let maxY = -1;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (alphaAt(png, pixels, x, y) > ALPHA_FLOOR) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Border ring — the part that abuts the canvas. */
function sampleBorder(png: Png, pixels: Buffer) {
  const bpp = CHANNELS[png.colorType];
  const stride = png.width * bpp;
  const step = Math.max(1, Math.floor(Math.min(png.width, png.height) / 40));
  const out: { r: number; g: number; b: number; a: number }[] = [];

  const at = (x: number, y: number) => {
    const i = y * stride + x * bpp;
    const alpha = hasAlpha(png.colorType) ? pixels[i + bpp - 1] : 255;
    if (png.colorType === 3 && png.palette) {
      const p = pixels[i] * 3;
      out.push({ r: png.palette[p], g: png.palette[p + 1], b: png.palette[p + 2], a: 255 });
    } else if (png.colorType === 0 || png.colorType === 4) {
      out.push({ r: pixels[i], g: pixels[i], b: pixels[i], a: alpha });
    } else {
      out.push({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: alpha });
    }
  };

  for (let x = 1; x < png.width - 1; x += step) {
    at(x, 1);
    at(x, png.height - 2);
  }
  for (let y = 1; y < png.height - 1; y += step) {
    at(1, y);
    at(png.width - 2, y);
  }
  return out;
}

const component = readFileSync(LOGO_COMPONENT, "utf8");

function componentSrc(): string {
  const match = component.match(/src="(\/[^"]+)"/);
  return match ? match[1] : "/logo.png";
}

function componentArtwork(): Record<string, number> | null {
  const block = component.match(/const ARTWORK = \{([^}]*)\}/);
  if (!block) return null;
  const out: Record<string, number> = {};
  for (const [, key, value] of block[1].matchAll(/(\w+):\s*(\d+)/g)) {
    out[key] = Number(value);
  }
  return out;
}

function cssColour(): string | null {
  const match = readFileSync(CSS_PATH, "utf8").match(
    /--color-brand-primary:\s*(#[0-9a-fA-F]{6})/,
  );
  return match ? match[1].toLowerCase() : null;
}

// --- report -----------------------------------------------------------------

const src = componentSrc();
const logoPath = `public${src}`;
let failed = false;

let file: Buffer;
try {
  file = readFileSync(logoPath);
} catch {
  console.log(`FAIL   ${logoPath} is missing. The idle screen will fall back to type.`);
  process.exit(1);
}

if (file.subarray(0, 3).toString("hex") === "ffd8ff") {
  console.log(`FAIL   ${logoPath} is a JPEG, not a PNG. JPEG cannot carry transparency.`);
  process.exit(1);
}

const png = parsePng(file);
if (!png) {
  console.log(`FAIL   ${logoPath} is not a readable PNG.`);
  process.exit(1);
}

console.log(`FILE   ${logoPath} (used by BrandLogo)`);
console.log(
  `       ${png.width}x${png.height}, colour type ${png.colorType}, ${Math.round(file.length / 1024)}KB`,
);

if (png.ancillary.length > 0) {
  console.log(`       colour chunks: ${png.ancillary.join(", ")} — may shift rendering slightly`);
}

const pixels = decode(png);
if (!pixels) {
  console.log("WARN   unsupported bit depth or interlacing; check by eye.");
  process.exit(0);
}

// --- background -------------------------------------------------------------

const border = sampleBorder(png, pixels);
const opaqueBorder = border.filter((s) => s.a === 255);
const transparent = opaqueBorder.length === 0;

if (transparent) {
  console.log("OK     transparent background — no canvas colour to match.");
} else {
  const mean = {
    r: Math.round(border.reduce((t, s) => t + s.r, 0) / border.length),
    g: Math.round(border.reduce((t, s) => t + s.g, 0) / border.length),
    b: Math.round(border.reduce((t, s) => t + s.b, 0) / border.length),
  };
  const spread = Math.max(
    Math.max(...border.map((s) => s.r)) - Math.min(...border.map((s) => s.r)),
    Math.max(...border.map((s) => s.g)) - Math.min(...border.map((s) => s.g)),
    Math.max(...border.map((s) => s.b)) - Math.min(...border.map((s) => s.b)),
  );
  const canvas = cssColour();
  const meanHex = hex(mean.r, mean.g, mean.b);

  console.log(`       opaque background: mean ${meanHex}, spread ${spread}, canvas ${canvas}`);

  if (spread > 12) {
    console.log("FAIL   background varies too much for any flat CSS colour to match it.");
    failed = true;
  } else if (canvas && meanHex !== canvas) {
    console.log(`FAIL   background does not match the canvas — a square will show.`);
    console.log(`         set --color-brand-primary: ${meanHex}; in ${CSS_PATH}`);
    failed = true;
  }

  // A lossy re-encode of a flat field shifts it and adds artifacts, which reads
  // as a mismatched square. Only matters when there is a background at all.
  if (!/unoptimized/.test(component)) {
    console.log("FAIL   BrandLogo must set `unoptimized`, or next/image will re-encode this");
    console.log("       background to lossy WebP and paint a different colour.");
    failed = true;
  }
}

// --- artwork box ------------------------------------------------------------

const box = boundingBox(png, pixels);

if (!box) {
  console.log("FAIL   the image is entirely transparent.");
  process.exit(1);
}

const pct = (v: number, total: number) => `${((v / total) * 100).toFixed(1)}%`;
const marginTop = pct(box.y, png.height);
const marginBottom = pct(png.height - (box.y + box.height), png.height);

console.log(
  `       visible artwork: ${box.width}x${box.height} at (${box.x}, ${box.y}); transparent margin top ${marginTop}, bottom ${marginBottom}`,
);

const declared = componentArtwork();

if (!declared) {
  console.log("WARN   could not read the ARTWORK constants from BrandLogo.");
} else {
  const expected = {
    imageWidth: png.width,
    imageHeight: png.height,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  };
  const wrong = Object.entries(expected).filter(([key, value]) => declared[key] !== value);

  if (wrong.length === 0) {
    console.log("OK     BrandLogo's crop matches the artwork, so its box is the visible logo.");
  } else {
    console.log("FAIL   BrandLogo's ARTWORK constants no longer match the file. Set:");
    for (const [key, value] of Object.entries(expected)) {
      console.log(`         ${key}: ${value},`);
    }
    failed = true;
  }
}

process.exit(failed ? 1 : 0);

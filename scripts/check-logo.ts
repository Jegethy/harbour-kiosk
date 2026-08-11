/**
 * Validates public/logo.png against the idle screen.
 *
 * Four things have gone wrong with this asset now: it was missing, then it was
 * a JPEG under a .png name, then the artwork gained its own background that has
 * to match the canvas, and then next/image re-encoded that background into
 * something slightly different from the file on disk.
 *
 * The last one is why this script samples the whole background rather than one
 * corner pixel, and why it reports the delivery path too. What matters is the
 * colour the browser paints, not the colour in the file.
 *
 * Run after replacing the artwork:  npm run check:logo
 */

import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const LOGO_PATH = "public/logo.png";
const CSS_PATH = "src/app/globals.css";
const LOGO_COMPONENT = "src/components/kiosk/BrandLogo.tsx";

const PNG_SIGNATURE = "89504e470d0a1a0a";
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

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

interface Sample {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Sample a ring just inside the border — the part that abuts the canvas. */
function sampleBorder(png: Png, pixels: Buffer): Sample[] {
  const bpp = CHANNELS[png.colorType];
  const stride = png.width * bpp;
  const inset = 1;
  const step = Math.max(1, Math.floor(Math.min(png.width, png.height) / 40));
  const out: Sample[] = [];

  const at = (x: number, y: number) => {
    const i = y * stride + x * bpp;
    if (png.colorType === 6) {
      out.push({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] });
    } else if (png.colorType === 2) {
      out.push({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: 255 });
    } else if (png.colorType === 4) {
      out.push({ r: pixels[i], g: pixels[i], b: pixels[i], a: pixels[i + 1] });
    } else if (png.colorType === 0) {
      out.push({ r: pixels[i], g: pixels[i], b: pixels[i], a: 255 });
    } else if (png.colorType === 3 && png.palette) {
      const p = pixels[i] * 3;
      out.push({ r: png.palette[p], g: png.palette[p + 1], b: png.palette[p + 2], a: 255 });
    }
  };

  for (let x = inset; x < png.width - inset; x += step) {
    at(x, inset);
    at(x, png.height - 1 - inset);
  }
  for (let y = inset; y < png.height - inset; y += step) {
    at(inset, y);
    at(png.width - 1 - inset, y);
  }

  return out;
}

function cssColour(): string | null {
  const match = readFileSync(CSS_PATH, "utf8").match(
    /--color-brand-primary:\s*(#[0-9a-fA-F]{6})/,
  );
  return match ? match[1].toLowerCase() : null;
}

function isUnoptimized(): boolean {
  return /unoptimized/.test(readFileSync(LOGO_COMPONENT, "utf8"));
}

// --- report -----------------------------------------------------------------

let file: Buffer;
try {
  file = readFileSync(LOGO_PATH);
} catch {
  console.log(`FAIL   ${LOGO_PATH} is missing. The idle screen will fall back to type.`);
  process.exit(1);
}

const signature = file.subarray(0, 4).toString("hex");
if (signature.startsWith("ffd8ff")) {
  console.log(`FAIL   ${LOGO_PATH} is a JPEG, not a PNG. JPEG cannot carry transparency.`);
  process.exit(1);
}

const png = parsePng(file);
if (!png) {
  console.log(`FAIL   ${LOGO_PATH} is not a readable PNG (signature ${signature}).`);
  process.exit(1);
}

console.log(
  `PNG    ${png.width}x${png.height}, bit depth ${png.bitDepth}, colour type ${png.colorType}, ${Math.round(file.length / 1024)}KB`,
);
console.log(`       set <Image width={${png.width}} height={${png.height}}> in BrandLogo.tsx`);

if (png.ancillary.length > 0) {
  console.log(`WARN   colour chunks present: ${png.ancillary.join(", ")}.`);
  console.log("       The browser may render these pixels differently from their raw values.");
}

const pixels = decode(png);
if (!pixels) {
  console.log("WARN   unsupported bit depth or interlacing; check the background by eye.");
  process.exit(0);
}

const border = sampleBorder(png, pixels);
const opaque = border.filter((s) => s.a === 255);
const canvas = cssColour();

console.log(`       idle canvas (--color-brand-primary) is ${canvas ?? "(not found)"}`);

if (opaque.length === 0) {
  console.log("OK     the border is fully transparent — the artwork has no baked-in");
  console.log("       background, so it sits cleanly on any canvas colour.");
  process.exit(0);
}

const channel = (pick: (s: Sample) => number) => border.map(pick);
const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

const mean = {
  r: Math.round(channel((s) => s.r).reduce((a, b) => a + b, 0) / border.length),
  g: Math.round(channel((s) => s.g).reduce((a, b) => a + b, 0) / border.length),
  b: Math.round(channel((s) => s.b).reduce((a, b) => a + b, 0) / border.length),
};
const worstSpread = Math.max(
  spread(channel((s) => s.r)),
  spread(channel((s) => s.g)),
  spread(channel((s) => s.b)),
);

console.log(
  `       background sampled at ${border.length} points around the border: mean ${hex(mean.r, mean.g, mean.b)}, spread ${worstSpread}`,
);

let failed = false;

if (worstSpread > 12) {
  console.log("FAIL   the background varies too much for any single CSS value to match.");
  console.log("       Re-export the logo with a transparent background.");
  failed = true;
} else if (canvas && hex(mean.r, mean.g, mean.b) !== canvas) {
  console.log("FAIL   the background does not match the canvas; a square will be visible.");
  console.log(`         set --color-brand-primary: ${hex(mean.r, mean.g, mean.b)}; in ${CSS_PATH}`);
  failed = true;
} else if (worstSpread > 2) {
  console.log(`OK     matches the canvas, but the background is textured rather than flat`);
  console.log(`       (varies by ${worstSpread}/255). The canvas sits on its mean, so any`);
  console.log("       residual edge is a shade or two — a transparent export removes it.");
} else {
  console.log("OK     the background is flat and matches the canvas in the source file.");
}

/*
 * The file being right is not enough. next/image re-encodes by default, and a
 * lossy pass over a large flat field shifts it and adds blocking artifacts —
 * which looks exactly like a mismatched square.
 */
if (!isUnoptimized()) {
  console.log("FAIL   BrandLogo.tsx does not set `unoptimized`, so next/image will re-encode");
  console.log("       this to lossy WebP and the browser will paint a slightly different");
  console.log("       colour than the one checked above.");
  failed = true;
} else {
  console.log("OK     BrandLogo.tsx serves the original file, so the browser paints these");
  console.log("       exact bytes.");
}

process.exit(failed ? 1 : 0);

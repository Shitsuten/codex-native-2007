import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LIMITS = Object.freeze({ side: 16_384, pixels: 50_000_000 });

const u16be = (data, at) => data[at] * 256 + data[at + 1];
const u16le = (data, at) => data[at] + data[at + 1] * 256;
const u24le = (data, at) => data[at] + data[at + 1] * 256 + data[at + 2] * 65_536;
const u32be = (data, at) => data[at] * 16_777_216 + data[at + 1] * 65_536 + data[at + 2] * 256 + data[at + 3];
const fourcc = (data, at) => String.fromCharCode(...data.subarray(at, at + 4));

function pngSize(data) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (data.length < 24 || signature.some((byte, index) => data[index] !== byte)) return null;
  if (fourcc(data, 12) !== "IHDR") return null;
  return { format: "png", width: u32be(data, 16), height: u32be(data, 20) };
}

function jpegSize(data) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  const dimensionMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let cursor = 2;
  while (cursor + 3 < data.length) {
    while (cursor < data.length && data[cursor] !== 0xff) cursor += 1;
    while (cursor < data.length && data[cursor] === 0xff) cursor += 1;
    if (cursor >= data.length) break;
    const marker = data[cursor++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 1 >= data.length) return null;
    const blockLength = u16be(data, cursor);
    if (blockLength < 2 || cursor + blockLength > data.length) return null;
    if (dimensionMarkers.has(marker)) {
      if (blockLength < 7) return null;
      return {
        format: "jpeg",
        width: u16be(data, cursor + 5),
        height: u16be(data, cursor + 3),
      };
    }
    cursor += blockLength;
  }
  return null;
}

function webpSize(data) {
  if (data.length < 30 || fourcc(data, 0) !== "RIFF" || fourcc(data, 8) !== "WEBP") return null;
  const kind = fourcc(data, 12);
  if (kind === "VP8X") {
    return {
      format: "webp",
      width: u24le(data, 24) + 1,
      height: u24le(data, 27) + 1,
    };
  }
  if (kind === "VP8L" && data[20] === 0x2f) {
    const bits = data[21] | (data[22] << 8) | (data[23] << 16) | (data[24] << 24);
    return {
      format: "webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }
  if (kind === "VP8 " && data.length >= 30 && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
    return {
      format: "webp",
      width: u16le(data, 26) & 0x3fff,
      height: u16le(data, 28) & 0x3fff,
    };
  }
  return null;
}

export function readImageMetadata(input, extension = "") {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const wanted = extension.toLowerCase().replace(/^\./, "");
  const detected = pngSize(data) ?? jpegSize(data) ?? webpSize(data);
  if (!detected) return null;
  if (wanted && !(
    wanted === detected.format ||
    (wanted === "jpg" && detected.format === "jpeg")
  )) return null;
  const { width, height } = detected;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
  if (width > LIMITS.side || height > LIMITS.side || width * height > LIMITS.pixels) return null;
  return { ...detected, ratio: width / height };
}

async function main() {
  const [flag, filename] = process.argv.slice(2);
  if (flag !== "--check" || !filename) {
    throw new Error("Usage: image-metadata.mjs --check <image>");
  }
  const absolute = path.resolve(filename);
  const metadata = readImageMetadata(await fs.readFile(absolute), path.extname(absolute));
  if (!metadata) throw new Error(`Unsupported or unsafe image: ${absolute}`);
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

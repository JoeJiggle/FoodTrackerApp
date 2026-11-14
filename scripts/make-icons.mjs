// Erzeugt das App-Icon als SVG und PNG (ohne externe Bibliotheken).
// Motiv: weißer Teller mit Strichcode auf grünem Grund. Aufruf: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(out, { recursive: true });

// Geometrie in Einheiten 0..1
const BG = [47, 125, 79];
const PLATE = [255, 255, 255];
const RIM = [226, 238, 230];
const BAR = [47, 125, 79];
const plate = { cx: 0.5, cy: 0.5, r: 0.31 };
const rim = 0.255; // innerer Tellerrand
const bars = [[0.37, 0.032], [0.418, 0.014], [0.448, 0.044], [0.508, 0.014], [0.538, 0.032], [0.586, 0.014], [0.614, 0.018]];
const barY = [0.395, 0.605];

function colorAt(x, y) {
  const d = Math.hypot(x - plate.cx, y - plate.cy);
  if (d > plate.r) return BG;
  if (y >= barY[0] && y <= barY[1] && bars.some(([bx, w]) => x >= bx && x <= bx + w)) return BAR;
  if (d > rim && d < rim + 0.012) return RIM;
  return PLATE;
}

function svg(rounded) {
  const f = (n) => +(n * 512).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" ${rounded ? 'rx="112" ' : ''}fill="rgb(${BG})"/>
<circle cx="${f(plate.cx)}" cy="${f(plate.cy)}" r="${f(plate.r)}" fill="#fff"/>
<circle cx="${f(plate.cx)}" cy="${f(plate.cy)}" r="${f(rim + 0.006)}" fill="none" stroke="rgb(${RIM})" stroke-width="${f(0.012)}"/>
${bars.map(([x, w]) => `<rect x="${f(x)}" y="${f(barY[0])}" width="${f(w)}" height="${f(barY[1] - barY[0])}" fill="rgb(${BAR})"/>`).join('\n')}
</svg>
`;
}

// ---------- PNG ----------

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, scale = 1) {
  const SS = 4; // Kantenglättung durch 4×4-Abtastung
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        // scale < 1 verkleinert das Motiv (Sicherheitszone für maskable Icons)
        const x = 0.5 + (((px + (sx + 0.5) / SS) / size) - 0.5) / scale;
        const y = 0.5 + (((py + (sy + 0.5) / SS) / size) - 0.5) / scale;
        const c = colorAt(x, y);
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      raw[o] = Math.round(r / SS / SS); raw[o + 1] = Math.round(g / SS / SS); raw[o + 2] = Math.round(b / SS / SS);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 Bit, RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync(join(out, 'icon.svg'), svg(true));
writeFileSync(join(out, 'apple-touch-icon.png'), png(180));
writeFileSync(join(out, 'icon-192.png'), png(192));
writeFileSync(join(out, 'icon-512.png'), png(512));
writeFileSync(join(out, 'icon-maskable-512.png'), png(512, 0.8));
console.log('Icons erzeugt in', out);

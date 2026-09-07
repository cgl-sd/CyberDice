/**
 * 生成 src/common/images/icon.png（192x192，无第三方依赖的极简 PNG 编码器）
 * 图案：深蓝底 + 白色圆角骰面 + 5 点黑色点阵
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZE = 192;

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// 简易"圆角矩形内"判定与距离场
function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  const dx = x - cx, dy = y - cy;
  if (x < x0 + r && y < y0 + r) return dx * dx + dy * dy <= r * r;
  if (x > x1 - r && y < y0 + r) return dx * dx + dy * dy <= r * r;
  if (x < x0 + r && y > y1 - r) return dx * dx + dy * dy <= r * r;
  if (x > x1 - r && y > y1 - r) return dx * dx + dy * dy <= r * r;
  return true;
}

const rows = [];
for (let y = 0; y < SIZE; y++) {
  const row = Buffer.alloc(1 + SIZE * 4);
  for (let x = 0; x < SIZE; x++) {
    let r = 0x2b, g = 0x4b, b = 0xd7, a = 255; // 底色 #2B4BD7
    // 白色骰面
    if (inRoundedRect(x, y, 30, 30, 161, 161, 34)) {
      r = 0xf5; g = 0xf6; b = 0xfa;
      // 5 点点阵：中心与四角
      const pips = [[63, 63], [129, 63], [96, 96], [63, 129], [129, 129]];
      for (const [px, py] of pips) {
        const dx = x - px, dy = y - py;
        if (dx * dx + dy * dy <= 13 * 13) {
          r = 0x1a; g = 0x1f; b = 0x2e;
          break;
        }
      }
    }
    const o = 1 + x * 4;
    row[o] = r; row[o + 1] = g; row[o + 2] = b; row[o + 3] = a;
  }
  rows.push(row);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', '..', 'src', 'common', 'images', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('written', out, png.length, 'bytes');

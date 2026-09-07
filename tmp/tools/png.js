/**
 * 极简 PNG 光栅工具：逐像素填充、盒式模糊、超采样缩放、保存。
 * 无第三方依赖（zlib + CRC32 内置）。
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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

function createCanvas(w, h) {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

/** fill(canvas, (x, y) => [r,g,b,a]) */
function fill(canvas, fn) {
  for (let y = 0; y < canvas.h; y++) {
    for (let x = 0; x < canvas.w; x++) {
      const out = fn(x, y) || [0, 0, 0, 0];
      const o = (y * canvas.w + x) * 4;
      canvas.data[o] = out[0];
      canvas.data[o + 1] = out[1];
      canvas.data[o + 2] = out[2];
      canvas.data[o + 3] = out[3];
    }
  }
}

/** 合成 src 到 dst 的 (dx,dy) 处（straight alpha over） */
function composite(dst, src, dx, dy) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const so = (y * src.w + x) * 4;
      const sa = src.data[so + 3] / 255;
      if (sa <= 0) continue;
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
      const to = (ty * dst.w + tx) * 4;
      const da = dst.data[to + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        dst.data[to + c] = (src.data[so + c] * sa + dst.data[to + c] * da * (1 - sa)) / (oa || 1);
      }
      dst.data[to + 3] = oa * 255;
    }
  }
}

/** 盒式模糊（premultiply 处理透明度），passes 越多越接近高斯 */
function boxBlur(canvas, radius, passes) {
  const n = passes || 2;
  for (let p = 0; p < n; p++) blurPass(canvas, radius);
}

function blurPass(canvas, r) {
  const { w, h, data } = canvas;
  const tmp = new Uint8ClampedArray(data.length);
  // 水平
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0, cnt = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        const o = (y * w + xx) * 4;
        const a = data[o + 3] / 255;
        sr += data[o] * a; sg += data[o + 1] * a; sb += data[o + 2] * a; sa += a; cnt++;
      }
      const o2 = (y * w + x) * 4;
      const avgA = sa / cnt;
      tmp[o2] = avgA > 0 ? sr / sa : 0;
      tmp[o2 + 1] = avgA > 0 ? sg / sa : 0;
      tmp[o2 + 2] = avgA > 0 ? sb / sa : 0;
      tmp[o2 + 3] = avgA * 255;
    }
  }
  // 垂直
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0, cnt = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        const o = (yy * w + x) * 4;
        const a = tmp[o + 3] / 255;
        sr += tmp[o] * a; sg += tmp[o + 1] * a; sb += tmp[o + 2] * a; sa += a; cnt++;
      }
      const o2 = (y * w + x) * 4;
      const avgA = sa / cnt;
      data[o2] = avgA > 0 ? sr / sa : 0;
      data[o2 + 1] = avgA > 0 ? sg / sa : 0;
      data[o2 + 2] = avgA > 0 ? sb / sa : 0;
      data[o2 + 3] = avgA * 255;
    }
  }
}

/** 整数倍降采样（超采样抗锯齿用） */
function downsample(canvas, factor) {
  const w = Math.floor(canvas.w / factor);
  const h = Math.floor(canvas.h / factor);
  const out = createCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const o = ((y * factor + dy) * canvas.w + (x * factor + dx)) * 4;
          r += canvas.data[o]; g += canvas.data[o + 1]; b += canvas.data[o + 2]; a += canvas.data[o + 3];
        }
      }
      const n = factor * factor;
      const o2 = (y * w + x) * 4;
      out.data[o2] = r / n; out.data[o2 + 1] = g / n; out.data[o2 + 2] = b / n; out.data[o2 + 3] = a / n;
    }
  }
  return out;
}

function save(canvas, file) {
  const rows = [];
  for (let y = 0; y < canvas.h; y++) {
    const row = Buffer.alloc(1 + canvas.w * 4);
    row.set(canvas.data.subarray(y * canvas.w * 4, (y + 1) * canvas.w * 4), 1);
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.w, 0);
  ihdr.writeUInt32BE(canvas.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  return png.length;
}

module.exports = { createCanvas, fill, composite, boxBlur, downsample, save };

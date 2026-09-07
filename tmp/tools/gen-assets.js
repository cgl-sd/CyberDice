/**
 * CyberDice 资产生成器（依据 UI 概念图）：
 *  - common/images/icon.png            应用图标（深色圆角方块 + 白色 3D 等距骰子）
 *  - common/images/dice/die-{1..6}.png 静止骰子面（2x 输出，左面为对应点数）
 *  - common/images/dice/shake-{1..4}.png 摇动残影帧（不是最终随机结果）
 *  - common/images/result-ticks.png    结果页蓝色刻度线（中心镂空，叠加大数字）
 *  - common/images/glyph-doc.png       历史空状态文档图形
 *  - common/images/glyph-clock.png / glyph-gear.png  首页入口小图标
 *
 * 全部逐像素光栅化 + 2x 超采样抗锯齿，无第三方依赖。
 * 运行：node tmp/tools/gen-assets.js
 */
const { createCanvas, fill, composite, boxBlur, downsample, save } = require('./png.js');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const OUT = path.join(__dirname, '..', '..', 'src', 'common', 'images');
const REFERENCE = path.join(__dirname, '..', 'reference', 'design', 'e31c58c5-5586-4229-88c4-8791c72703df.png');
const SS = 2; // 超采样倍数

const PIP_LAYOUT = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** 距离场工具 */
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function roundedRectDist(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return Math.hypot(x - cx, y - cy) - r;
}

/**
 * 3D 等距骰子渲染（透明背景，圆角边棱，贴近概念图质感）。
 * values: { left, right, top } 各面点数；size = 立方体边长（逻辑像素）
 * 投影：正等轴（剪影为正六边形，宽:高≈0.866，与概念图一致）。
 * 圆角采用形态学开运算（先腐蚀后膨胀）：只圆 6 个凸角，不侵蚀直边。
 */
function renderDie(size, values) {
  const S3 = 3; // 本函数内部超采样
  const W = Math.round(size * 2.2) * S3;
  const H = Math.round(size * 2.2) * S3;
  const e = size * S3;
  const cx = W / 2;
  const cy = H / 2 + e * 0.04;

  // 六边形顶点（屏幕 y 向下）
  const V = (deg) => [cx + e * Math.cos((deg * Math.PI) / 180), cy + e * Math.sin((deg * Math.PI) / 180)];
  const vTop = V(-90), vUR = V(-30), vLR = V(30), vBot = V(90), vLL = V(150), vUL = V(210);
  const C = [cx, cy];

  // 三个可见面：平行四边形参数化 (O, u, v)
  const faces = [
    { O: vTop, u: [vUR[0] - vTop[0], vUR[1] - vTop[1]], v: [vUL[0] - vTop[0], vUL[1] - vTop[1]], bright: 1.0, value: values.top, name: 'top' },
    { O: vUL, u: [C[0] - vUL[0], C[1] - vUL[1]], v: [0, vBot[1] - vLL[1]], bright: 0.88, value: values.left, name: 'left' },
    { O: vUR, u: [C[0] - vUR[0], C[1] - vUR[1]], v: [0, vBot[1] - vLR[1]], bright: 0.60, value: values.right, name: 'right' },
  ];
  faces.forEach((f) => {
    const [ux, uy] = f.u, [vx, vy] = f.v;
    f.det = ux * vy - uy * vx;
  });

  // 内部棱线（亮度柔化带）
  const seams = [
    { a: vUL, b: C, f1: 'top', f2: 'left' },
    { a: vUR, b: C, f1: 'top', f2: 'right' },
    { a: C, b: vBot, f1: 'left', f2: 'right' },
  ];
  seams.forEach((s) => {
    // 法向量按 f1 质心方向定向
    const mid = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
    let n = [s.b[1] - s.a[1], -(s.b[0] - s.a[0])];
    const len = Math.hypot(n[0], n[1]) || 1;
    n = [n[0] / len, n[1] / len];
    const fA = faces.find((f) => f.name === s.f1);
    const cA = [fA.O[0] + fA.u[0] / 2 + fA.v[0] / 2, fA.O[1] + fA.u[1] / 2 + fA.v[1] / 2];
    if (n[0] * (cA[0] - mid[0]) + n[1] * (cA[1] - mid[1]) < 0) n = [-n[0], -n[1]];
    s.n = n;
    s.mid = mid;
  });

  const PIP_R = 0.088;
  const PIP = [30, 32, 40];
  const ROUND = Math.round(0.15 * e);
  const SEAM_W = 0.10 * e;

  // Pass 1：尖锐六边形逐像素面分类（0=外部，1/2/3=面索引）
  const cls = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx0 = x - cx, dy0 = y - cy;
      const lx = Math.abs(dx0), ly = Math.abs(dy0);
      if (lx > 0.866 * e || ly > e - lx / Math.sqrt(3)) continue;
      let bi = -1, bestOver = Infinity;
      for (let i = 0; i < 3; i++) {
        const f = faces[i];
        const dx = x - f.O[0], dy = y - f.O[1];
        const [ux, uy] = f.u, [vx, vy] = f.v;
        const p = (dx * vy - dy * vx) / f.det;
        const q = (ux * dy - uy * dx) / f.det;
        const over = Math.max(0, -p) + Math.max(0, p - 1) + Math.max(0, -q) + Math.max(0, q - 1);
        if (over < bestOver) { bestOver = over; bi = i; }
      }
      cls[y * W + x] = bi + 1;
    }
  }

  // Pass 2：chamfer 距离变换（到最近零像素/源像素的近似欧氏距离）
  function chamfer(isSource) {
    const INF = 1e9;
    const d = new Float32Array(W * H).fill(INF);
    for (let i = 0; i < W * H; i++) if (isSource(i)) d[i] = 0;
    const D1 = 1, D2 = Math.SQRT2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + D1);
        if (y > 0) v = Math.min(v, d[i - W] + D1);
        if (x > 0 && y > 0) v = Math.min(v, d[i - W - 1] + D2);
        if (x < W - 1 && y > 0) v = Math.min(v, d[i - W + 1] + D2);
        d[i] = v;
      }
    }
    for (let y = H - 1; y >= 0; y--) {
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        let v = d[i];
        if (x < W - 1) v = Math.min(v, d[i + 1] + D1);
        if (y < H - 1) v = Math.min(v, d[i + W] + D1);
        if (x < W - 1 && y < H - 1) v = Math.min(v, d[i + W + 1] + D2);
        if (x > 0 && y < H - 1) v = Math.min(v, d[i + W - 1] + D2);
        d[i] = v;
      }
    }
    return d;
  }

  const inside = (i) => cls[i] > 0;
  const distOut = chamfer((i) => !inside(i));           // 内部像素到外部的距离
  const eroded = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (inside(i) && distOut[i] >= ROUND) eroded[i] = 1;
  const distToEroded = chamfer((i) => eroded[i] === 1); // 任意像素到腐蚀体的距离
  // 开运算结果（仍属原六边形子集）
  const rounded = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) rounded[i] = inside(i) && distToEroded[i] <= ROUND ? 1 : 0;

  function faceBase(f, x, y) {
    const dx = x - f.O[0], dy = y - f.O[1];
    const [ux, uy] = f.u, [vx, vy] = f.v;
    const p = (dx * vy - dy * vx) / f.det;
    const q = (ux * dy - uy * dx) / f.det;
    const idxs = PIP_LAYOUT[f.value] || PIP_LAYOUT[1];
    for (const idx of idxs) {
      const pc = ((idx % 3) + 0.5) / 3;
      const qc = (Math.floor(idx / 3) + 0.5) / 3;
      if (Math.hypot(p - pc, q - qc) < PIP_R) {
        const k = Math.max(f.bright, 0.7) * (1 - 0.06 * q);
        return [PIP[0] * k, PIP[1] * k, PIP[2] * k];
      }
    }
    const base = 255 * f.bright * (1 - 0.06 * q);
    return [base, base, base + 2];
  }

  // Pass 3：着色
  const canvas = createCanvas(W, H);
  const data = canvas.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!rounded[i]) continue;
      const f = faces[cls[i] - 1];
      let col = faceBase(f, x, y);
      for (const s of seams) {
        const d = segDist(x, y, s.a[0], s.a[1], s.b[0], s.b[1]);
        if (d < SEAM_W) {
          const signed = (x - s.mid[0]) * s.n[0] + (y - s.mid[1]) * s.n[1];
          const t = Math.max(0, Math.min(1, 0.5 + signed / SEAM_W));
          const fA = faces.find((ff) => ff.name === s.f1);
          const fB = faces.find((ff) => ff.name === s.f2);
          const cA = faceBase(fA, x, y), cB = faceBase(fB, x, y);
          col = [cA[0] * t + cB[0] * (1 - t), cA[1] * t + cB[1] * (1 - t), cA[2] * t + cB[2] * (1 - t)];
          break;
        }
      }
      const o = i * 4;
      data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
    }
  }
  const out = downsample(canvas, S3);
  return out;
}

function genDieFrames() {
  for (let v = 1; v <= 6; v++) {
    // 左面为主点数；右/顶面配面随机感（确定性组合）
    const frame = renderDie(135, { left: v, right: ((v + 4) % 6) + 1, top: ((v + 2) % 6) + 1 });
    save(frame, path.join(OUT, 'dice', `die-${v}.png`));
  }
  // 摇动以半透明相邻姿态构成残影；其数值与最终 DiceEngine 结果完全无关。
  const phases = [
    [[-11, 5, 0.20, 2], [7, -4, 0.31, 4], [0, 0, 0.88, 1]],
    [[9, 4, 0.24, 5], [-8, -5, 0.34, 2], [0, 0, 0.84, 6]],
    [[-6, -7, 0.28, 3], [11, 3, 0.23, 1], [0, 0, 0.86, 4]],
    [[8, -6, 0.30, 6], [-10, 4, 0.22, 3], [0, 0, 0.85, 2]],
  ];
  phases.forEach((layers, i) => {
    const out = createCanvas(297, 297);
    layers.forEach(([dx, dy, opacity, value], layerIndex) => {
      const die = renderDie(135, { left: value, right: (value % 6) + 1, top: ((value + 2) % 6) + 1 });
      if (layerIndex < 2) boxBlur(die, 1, 1);
      for (let p = 3; p < die.data.length; p += 4) die.data[p] *= opacity;
      composite(out, die, dx, dy);
    });
    save(out, path.join(OUT, 'dice', `shake-${i + 1}.png`));
  });
}

/**
 * 从用户确认的概念图提取 READY 骰子与摇动残影，保持图案、光照、拖影一比一一致。
 * 这些是展示资源；随机结果依旧由 DiceEngine 生成，绝不从图片推导。
 */
function extractReferenceFrames() {
  if (!fs.existsSync(REFERENCE)) throw new Error('reference design image is missing: ' + REFERENCE);
  const diceOut = path.join(OUT, 'dice');
  const runSips = (args) => {
    const result = spawnSync('sips', args, { encoding: 'utf8' });
    if (result.status !== 0) throw new Error('sips failed: ' + (result.stderr || result.stdout));
  };
  const extract = (name, height, width, y, x) => {
    const tmp = path.join(diceOut, '.' + name + '-crop.png');
    const out = path.join(diceOut, name + '.png');
    runSips(['-c', String(height), String(width), '--cropOffset', String(y), String(x), REFERENCE, '--out', tmp]);
    runSips(['-z', '296', '296', tmp, '--out', out]);
    fs.unlinkSync(tmp);
  };
  // 首页静止骰子，以及摇动屏幕中的同一颗骰子和灰色残影。
  extract('ready-reference', 148, 148, 158, 394);
  [[151, 668], [148, 664], [154, 671], [150, 667]].forEach(([y, x], i) => extract('shake-' + (i + 1), 168, 168, y, x));
}

function genIcon() {
  const S = 192;
  const canvas = createCanvas(S * SS, S * SS);
  fill(canvas, (x, y) => {
    const d = roundedRectDist(x, y, SS * 6, SS * 6, S * SS - SS * 6, S * SS - SS * 6, 46 * SS);
    if (d > 0) return [0, 0, 0, 0];
    // 深色底 + 顶部微亮渐变（贴近概念图图标质感）
    const t = y / (S * SS);
    const g = 30 + Math.round(10 * (1 - t));
    return [g, g, g + 4, 255];
  });
  const die = renderDie(74, { left: 5, right: 3, top: 1 });
  composite(canvas, die, Math.round((S * SS - die.w) / 2), Math.round((S * SS - die.h) / 2));
  save(downsample(canvas, SS), path.join(OUT, 'icon.png'));
}

function genResultTicks() {
  const S = 320;
  const canvas = createCanvas(S * SS, S * SS);
  const cx = (S * SS) / 2, cy = (S * SS) / 2;
  const ticks = [
    [18, 104, 130, 26], [62, 98, 128, 30], [108, 104, 130, 24], [153, 96, 126, 32],
    [198, 104, 130, 24], [242, 98, 128, 30], [288, 104, 130, 26], [333, 96, 126, 32],
  ];
  fill(canvas, (x, y) => {
    for (const [deg, r1, r2, len] of ticks) {
      const a = (deg * Math.PI) / 180;
      const cx1 = cx + r1 * SS * Math.cos(a), cy1 = cy + r1 * SS * Math.sin(a);
      const cx2 = cx + (r1 + len) * SS * Math.cos(a), cy2 = cy + (r1 + len) * SS * Math.sin(a);
      if (segDist(x, y, cx1, cy1, cx2, cy2) < 3.2 * SS) {
        return [47, 107, 237, 255]; // #2F6BED
      }
    }
    return [0, 0, 0, 0];
  });
  save(downsample(canvas, SS), path.join(OUT, 'result-ticks.png'));
}

function genDocGlyph() {
  const S = 96;
  const canvas = createCanvas(S * SS, S * SS);
  const col = [142, 144, 153];
  fill(canvas, (x, y) => {
    // 文档外框（描边）
    const d = roundedRectDist(x, y, 22 * SS, 12 * SS, 74 * SS, 84 * SS, 8 * SS);
    if (Math.abs(d) < 2.4 * SS) return [...col, 255];
    // 内部三行
    for (const [yy, half] of [[34, 14], [48, 14], [62, 9]]) {
      if (Math.abs(y - yy * SS) < 2.2 * SS && Math.abs(x - 48 * SS) < half * SS) return [...col, 255];
    }
    return [0, 0, 0, 0];
  });
  save(downsample(canvas, SS), path.join(OUT, 'glyph-doc.png'));
}

function genClockGlyph() {
  const S = 72;
  const canvas = createCanvas(S * SS, S * SS);
  const col = [200, 202, 208];
  const cx = 36 * SS, cy = 36 * SS;
  fill(canvas, (x, y) => {
    const r = Math.hypot(x - cx, y - cy) / SS;
    if (Math.abs(r - 26) < 2.2) return [...col, 255];
    if (segDist(x, y, cx, cy, cx, cy - 13 * SS) < 2.2 * SS) return [...col, 255];
    if (segDist(x, y, cx, cy, cx + 9 * SS, cy + 4 * SS) < 2.2 * SS) return [...col, 255];
    return [0, 0, 0, 0];
  });
  save(downsample(canvas, SS), path.join(OUT, 'glyph-clock.png'));
}

function genGearGlyph() {
  const S = 72;
  const canvas = createCanvas(S * SS, S * SS);
  const col = [200, 202, 208];
  const cx = 36 * SS, cy = 36 * SS;
  fill(canvas, (x, y) => {
    const r = Math.hypot(x - cx, y - cy) / SS;
    const a = ((Math.atan2(y - cy, x - cx) * 180) / Math.PI + 360) % 45;
    const tooth = a < 13 || a > 32;
    if (r >= 12 && r <= 18.5 && !tooth) return [...col, 255];
    if (r >= 12 && r <= 26 && tooth) return [...col, 255];
    return [0, 0, 0, 0];
  });
  save(downsample(canvas, SS), path.join(OUT, 'glyph-gear.png'));
}

genDieFrames();
extractReferenceFrames();
genIcon();
genResultTicks();
genDocGlyph();
genClockGlyph();
genGearGlyph();
console.log('assets generated into', OUT);

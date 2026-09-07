const assert = require('assert');
const mod = require('../../src/common/scripts/shake-detector.js');

/** 构造指定幅度的样本：把 m 分配到 y 上（其余为 0） */
function sample(t, m) {
  return { t: t, x: 0, y: m, z: 0 };
}

function feed(detector, samples) {
  const events = [];
  samples.forEach(function (s) {
    const ev = detector.pushSample(s);
    if (ev) {
      events.push({ t: s.t, ev: ev });
    }
  });
  return events;
}

test('ShakeDetector: 静止不触发', function () {
  const d = mod.createShakeDetector();
  const samples = [];
  for (let i = 0; i < 200; i++) {
    // 静止 z 向重力，微噪声 ±0.3
    samples.push({ t: i * 20, x: 0, y: 0, z: 9.8 + Math.sin(i) * 0.3 });
  }
  const events = feed(d, samples);
  assert.strictEqual(events.length, 0, '静止不应产生事件: ' + JSON.stringify(events));
});

test('ShakeDetector: 轻微抬腕/看时间不触发', function () {
  const d = mod.createShakeDetector();
  const samples = [];
  // 缓慢抬腕：重力分量在 4 秒内从 9.8 缓变到 6.0，加速度变化平缓
  for (let i = 0; i < 200; i++) {
    const z = 9.8 - (2.8 * i) / 200;
    samples.push({ t: i * 20, x: 0.4, y: 0.2, z: z });
  }
  const events = feed(d, samples);
  assert.strictEqual(events.length, 0, '轻微抬腕不应触发: ' + JSON.stringify(events));
});

test('ShakeDetector: 正常走路（幅度 ~±2）不触发', function () {
  const d = mod.createShakeDetector();
  const samples = [];
  for (let i = 0; i < 500; i++) {
    const m = 9.8 + Math.sin(i * 0.9) * 2.0; // 步行摆动幅度约 2
    samples.push(sample(i * 20, m));
  }
  const events = feed(d, samples);
  assert.strictEqual(events.length, 0, '步行不应触发: ' + JSON.stringify(events));
});

test('ShakeDetector: 明显摇动触发一次 SHAKE_START，停止后仅一次 SHAKE_END', function () {
  const d = mod.createShakeDetector();
  const samples = [];
  let t = 0;
  // 先静止建立基线
  for (let i = 0; i < 20; i++) {
    samples.push(sample(t, 9.8));
    t += 20;
  }
  // 主动摇骰 1 秒：幅度在 9.8±(4~9) 之间快速摆动
  for (let i = 0; i < 50; i++) {
    const m = 9.8 + Math.sin(i * 2.1) * (5 + (i % 5));
    samples.push(sample(t, m));
    t += 20;
  }
  // 停止 600ms
  for (let i = 0; i < 30; i++) {
    samples.push(sample(t, 9.8 + Math.sin(i) * 0.2));
    t += 20;
  }
  const events = feed(d, samples);
  const starts = events.filter(function (e) { return e.ev === 'SHAKE_START'; });
  const ends = events.filter(function (e) { return e.ev === 'SHAKE_END'; });
  assert.strictEqual(starts.length, 1, '应恰好触发一次 SHAKE_START: ' + JSON.stringify(events));
  assert.strictEqual(ends.length, 1, '应恰好触发一次 SHAKE_END: ' + JSON.stringify(events));
  assert.ok(ends[0].t > starts[0].t, 'SHAKE_END 应晚于 SHAKE_START');
});

test('ShakeDetector: 结束后再次摇动可再次触发（支持 SETTLING 复检）', function () {
  const d = mod.createShakeDetector();
  const samples = [];
  let t = 0;
  for (let i = 0; i < 20; i++) {
    samples.push(sample(t, 9.8));
    t += 20;
  }
  // 第一段摇动
  for (let i = 0; i < 30; i++) {
    samples.push(sample(t, 9.8 + Math.sin(i * 2.3) * 6));
    t += 20;
  }
  // 停止 600ms -> SHAKE_END
  for (let i = 0; i < 30; i++) {
    samples.push(sample(t, 9.8));
    t += 20;
  }
  // 第二段摇动
  for (let i = 0; i < 30; i++) {
    samples.push(sample(t, 9.8 + Math.sin(i * 2.3) * 6));
    t += 20;
  }
  const events = feed(d, samples);
  const starts = events.filter(function (e) { return e.ev === 'SHAKE_START'; });
  assert.strictEqual(starts.length, 2, '两段摇动应各自触发: ' + JSON.stringify(events));
});

test('ShakeDetector: reset 清空内部状态', function () {
  const d = mod.createShakeDetector();
  d.pushSample({ t: 0, x: 0, y: 0, z: 9.8 });
  d.reset();
  assert.strictEqual(d.getState(), 'IDLE');
  // reset 后短促单峰不应触发
  const ev1 = d.pushSample({ t: 100, x: 0, y: 15, z: 0 });
  const ev2 = d.pushSample({ t: 120, x: 0, y: 0, z: 9.8 });
  assert.strictEqual(ev1, null);
  assert.strictEqual(ev2, null);
});

test('ShakeDetector: dt=0 / 重复时间戳样本不产生 NaN 或异常', function () {
  const d = mod.createShakeDetector();
  assert.doesNotThrow(function () {
    d.pushSample({ t: 1000, x: 0, y: 0, z: 9.8 });
    d.pushSample({ t: 1000, x: 0, y: 15, z: 0 });
    d.pushSample({ t: 1000, x: 0, y: 0, z: 9.8 });
    d.pushSample({ t: 999, x: 0, y: 0, z: 9.8 });
  });
  assert.strictEqual(d.getState(), 'IDLE');
});

test('ShakeDetector: 吞吐量冒烟——10 万样本 < 500ms（20ms 采样预算充裕）', function () {
  const d = mod.createShakeDetector();
  const start = Date.now();
  let events = 0;
  for (let i = 0; i < 100000; i++) {
    const m = 9.8 + Math.sin(i * 0.13) * (i % 2000 < 100 ? 7 : 1.5);
    const ev = d.pushSample({ t: i * 20, x: 0, y: m, z: 0 });
    if (ev) events++;
  }
  const cost = Date.now() - start;
  assert.ok(cost < 500, '10 万样本耗时 ' + cost + 'ms 超预算');
  assert.ok(events > 0, '混合信号应产生事件');
});

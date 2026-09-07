const assert = require('assert');
const engine = require('../../src/common/scripts/dice-engine.js');

test('DiceEngine: 1D6 结果范围 1~6', function () {
  for (let i = 0; i < 5000; i++) {
    const r = engine.roll('1D6');
    assert.ok(r.dice.length === 1, '1D6 只有一颗骰子');
    assert.ok(r.dice[0] >= 1 && r.dice[0] <= 6, 'D6 范围 ' + r.dice[0]);
  }
});

test('DiceEngine: 1D20 结果范围 1~20 且覆盖两端', function () {
  const seen = new Set();
  for (let i = 0; i < 20000; i++) {
    const r = engine.roll('1D20');
    assert.ok(r.dice[0] >= 1 && r.dice[0] <= 20, 'D20 范围 ' + r.dice[0]);
    seen.add(r.dice[0]);
  }
  assert.ok(seen.has(1) && seen.has(20), 'D20 应能取到边界值');
});

test('DiceEngine: 2D6 两颗骰子独立且总和正确', function () {
  const freqA = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 20000; i++) {
    const r = engine.roll('2D6');
    assert.ok(r.dice.length === 2);
    assert.ok(r.dice[0] >= 1 && r.dice[0] <= 6);
    assert.ok(r.dice[1] >= 1 && r.dice[1] <= 6);
    assert.strictEqual(r.total, r.dice[0] + r.dice[1], '总和必须等于两骰相加');
    freqA[r.dice[0]]++;
  }
  // 每颗骰子边缘分布应近似均匀（20000 次期望 ~3333，容差 ±15%）
  for (let v = 1; v <= 6; v++) {
    assert.ok(Math.abs(freqA[v] - 20000 / 6) < 20000 / 6 * 0.15,
      '单骰分布应均匀，面 ' + v + ' 出现 ' + freqA[v]);
  }
});

test('DiceEngine: 2D6 总和分布非均匀（非 2~12 直接抽样）', function () {
  // 独立双骰总和 7 的频率应显著高于 2 或 12
  let seven = 0, two = 0, twelve = 0;
  for (let i = 0; i < 30000; i++) {
    const r = engine.roll('2D6');
    if (r.total === 7) seven++;
    else if (r.total === 2) two++;
    else if (r.total === 12) twelve++;
  }
  assert.ok(seven > two * 3, '总和 7 应远多于 2（独立双骰分布）');
  assert.ok(seven > twelve * 3, '总和 7 应远多于 12（独立双骰分布）');
});

test('DiceEngine: 未知模式兜底为 1D6，不抛异常', function () {
  const r = engine.roll('WHATEVER');
  assert.ok(r.dice[0] >= 1 && r.dice[0] <= 6);
});

// ---- v1.1 扩展：3D6 / 自定义 / normalizeMode ----

test('DiceEngine: 3D6 三颗独立 D6，总和正确', function () {
  for (let i = 0; i < 3000; i++) {
    const r = engine.roll('3D6');
    assert.ok(r.dice.length === 3);
    r.dice.forEach((v) => assert.ok(v >= 1 && v <= 6));
    assert.strictEqual(r.total, r.dice[0] + r.dice[1] + r.dice[2]);
  }
});

test('DiceEngine: 自定义 {count,sides} 范围与数量正确', function () {
  for (let i = 0; i < 2000; i++) {
    const r = engine.roll({ count: 3, sides: 20 });
    assert.ok(r.dice.length === 3);
    r.dice.forEach((v) => assert.ok(v >= 1 && v <= 20));
    assert.strictEqual(r.total, r.dice.reduce((a, b) => a + b, 0));
  }
});

test('DiceEngine: normalizeMode 边界兜底（不阻塞 UI）', function () {
  assert.deepStrictEqual(engine.normalizeMode('2D6'), { count: 2, sides: 6, label: '2D6' });
  // 未知字符串 -> 1D6 兜底
  assert.deepStrictEqual(engine.normalizeMode('9D9'), { count: 1, sides: 6, label: '1D6' });
  assert.deepStrictEqual(engine.normalizeMode(undefined), { count: 1, sides: 6, label: '1D6' });
  // 自定义越界收敛
  assert.strictEqual(engine.normalizeMode({ count: 0, sides: 999 }).count, 1);
  assert.strictEqual(engine.normalizeMode({ count: 99, sides: 2 }).count, 6);
  assert.strictEqual(engine.normalizeMode({ count: 2.7, sides: 6.9 }).label, '2D6');
});

test('DiceEngine: modeLabel 对预设与自定义一致', function () {
  assert.strictEqual(engine.modeLabel('1D20'), '1D20');
  assert.strictEqual(engine.modeLabel({ count: 3, sides: 8 }), '3D8');
});

const assert = require('assert');
const mod = require('../../src/common/scripts/roll-controller.js');
const diceEngine = require('../../src/common/scripts/dice-engine.js');
const { createFakeClock } = require('./fake-clock.js');

function makeFeedback() {
  const fb = { count: 0, vibrate: function () { fb.count += 1; } };
  return fb;
}

function makeController(clock, extra) {
  const opts = Object.assign(
    {
      diceEngine: diceEngine,
      feedback: makeFeedback(),
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    },
    extra || {}
  );
  return mod.createRollController(opts);
}

test('RollController: 持续摇动 3 秒只结算一次，停稳后才重新触发', function () {
  const clock = createFakeClock();
  const fb = makeFeedback();
  let rolls = 0;
  const c = makeController(clock, {
    feedback: fb,
    diceEngine: { roll: function () { rolls += 1; return { dice: [3], total: 3 }; } },
  });
  c.onShakeStart();
  clock.advance(2999);
  assert.strictEqual(rolls, 0);
  clock.advance(1);
  assert.strictEqual(c.getState(), 'RESULT');
  assert.strictEqual(rolls, 1);
  assert.strictEqual(fb.count, 1);
  clock.advance(1000);
  assert.strictEqual(c.onShakeStart(), false);
  assert.strictEqual(c.trigger('shake'), false);
  clock.advance(10000);
  assert.strictEqual(rolls, 1);
  c.onShakeEnd();
  assert.strictEqual(c.onShakeStart(), true);
  clock.advance(3000);
  assert.strictEqual(rolls, 2);
});

test('RollController: 重新摇动不延长上限，截止时取消待执行的收束回调', function () {
  const clock = createFakeClock();
  const fb = makeFeedback();
  const c = makeController(clock, { feedback: fb });
  c.onShakeStart();
  clock.advance(2700);
  c.onShakeEnd();
  clock.advance(100);
  c.onShakeStart();
  clock.advance(100);
  c.onShakeEnd();
  clock.advance(100);
  assert.strictEqual(c.getState(), 'RESULT');
  clock.advance(100);
  assert.strictEqual(fb.count, 1);
  clock.advance(900);
  assert.strictEqual(c.onShakeStart(), true, '截止前已停稳，可开始新的摇动');
  c.destroy();
  clock.advance(5000);
  assert.strictEqual(fb.count, 1);
  assert.strictEqual(clock.pendingCount(), 0);
});

test('RollController: 强制结算后冷却期间停稳可解锁，点击仍可独立触发', function () {
  const clock = createFakeClock();
  const c = makeController(clock);
  c.onShakeStart();
  clock.advance(3000);
  c.onShakeEnd();
  clock.advance(1000);
  assert.strictEqual(c.onShakeStart(), true);
  clock.advance(4000);
  assert.strictEqual(c.trigger('tap'), true);
  clock.advance(700);
  assert.strictEqual(c.getState(), 'RESULT');
});

test('RollController: 点击触发完整流程 READY→SHAKING→SETTLING→RESULT→READY', function () {
  const clock = createFakeClock();
  const states = [];
  const results = [];
  const fb = makeFeedback();
  const c = mod.createRollController({
    diceEngine: diceEngine,
    feedback: fb,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    onStateChange: function (s) { states.push(s); },
    onResult: function (r) { results.push(r); },
  });

  assert.strictEqual(c.getState(), 'READY');
  assert.strictEqual(c.trigger('tap'), true);
  assert.strictEqual(c.getState(), 'SHAKING');
  clock.advance(500); // tap 动画时长
  assert.strictEqual(c.getState(), 'SETTLING');
  clock.advance(200); // 去抖
  assert.strictEqual(c.getState(), 'RESULT');
  assert.strictEqual(results.length, 1, '一次掷骰只生成一次结果');
  assert.strictEqual(fb.count, 1, '结果锁定时恰好震动一次');
  assert.ok(results[0].dice.length === 1 && results[0].dice[0] >= 1 && results[0].dice[0] <= 6);
  clock.advance(1000); // 结果展示/冷却
  assert.strictEqual(c.getState(), 'READY');
  assert.deepStrictEqual(states, ['SHAKING', 'SETTLING', 'RESULT', 'READY'], '状态顺序合法');
});

test('RollController: SHAKING/RESULT 期间触发被忽略（防重入与冷却）', function () {
  const clock = createFakeClock();
  const results = [];
  const c = makeController(clock, { onResult: function (r) { results.push(r); } });

  assert.strictEqual(c.trigger('tap'), true);
  assert.strictEqual(c.trigger('tap'), false, 'SHAKING 中防重入');
  assert.strictEqual(c.trigger('shake'), false);
  c.onShakeStart();
  assert.strictEqual(c.getState(), 'SHAKING', 'SHAKING 中摇动事件不影响流程');
  clock.advance(500 + 200);
  assert.strictEqual(c.getState(), 'RESULT');
  assert.strictEqual(c.trigger('tap'), false, 'RESULT 冷却中忽略触发');
  assert.strictEqual(c.onShakeStart(), false, 'RESULT 冷却中忽略摇动');
  assert.strictEqual(results.length, 1, '冷却期间无重复 roll');
  clock.advance(1000);
  assert.strictEqual(c.trigger('tap'), true, '冷却结束后可再次掷骰');
  assert.strictEqual(results.length, 1);
});

test('RollController: 摇腕触发流程 + 最短动画时长', function () {
  const clock = createFakeClock();
  const states = [];
  const results = [];
  const c = makeController(clock, {
    onStateChange: function (s) { states.push(s); },
    onResult: function (r) { results.push(r); },
  });

  assert.strictEqual(c.onShakeStart(), true);
  assert.strictEqual(c.getState(), 'SHAKING');
  clock.advance(100);
  assert.strictEqual(c.onShakeEnd(), true); // 提前停止（动画已 100ms）
  assert.strictEqual(c.getState(), 'SETTLING');
  clock.advance(299);
  assert.strictEqual(c.getState(), 'SETTLING', '未达最短动画时长 400ms 前不应结算');
  clock.advance(101); // t=400ms，动画总时长满足
  assert.strictEqual(c.getState(), 'RESULT');
  assert.strictEqual(results.length, 1);
  assert.ok(states[states.length - 1] === 'RESULT');
});

test('RollController: SETTLING 去抖期间重新摇动则回到 SHAKING，最终仍只出一次结果', function () {
  const clock = createFakeClock();
  const results = [];
  const c = makeController(clock, { onResult: function (r) { results.push(r); } });

  c.onShakeStart();
  clock.advance(500);
  c.onShakeEnd();
  assert.strictEqual(c.getState(), 'SETTLING');
  assert.strictEqual(c.onShakeStart(), true, '去抖期重新出现强运动 -> 回到 SHAKING');
  assert.strictEqual(c.getState(), 'SHAKING');
  clock.advance(300);
  c.onShakeEnd();
  clock.advance(600);
  assert.strictEqual(c.getState(), 'RESULT');
  clock.advance(1000);
  assert.strictEqual(c.getState(), 'READY');
  assert.strictEqual(results.length, 1, '整个流程只产生一次最终结果');
});

test('RollController: 点击与摇腕共用同一结果流程', function () {
  const clock = createFakeClock();
  const results = [];
  const c = makeController(clock, { onResult: function (r) { results.push(r); } });

  c.trigger('tap');
  clock.advance(500 + 200);
  clock.advance(1000);
  c.onShakeStart();
  clock.advance(500);
  c.onShakeEnd();
  clock.advance(600 + 1000);
  assert.strictEqual(results.length, 2, '两种来源各产出一次结果');
  results.forEach(function (r) {
    assert.ok(r.dice.length === 1 && r.dice[0] >= 1 && r.dice[0] <= 6);
  });
});

test('RollController: 摇动过程中禁止切换模式（7.3 节）', function () {
  const clock = createFakeClock();
  const c = makeController(clock);
  assert.strictEqual(c.setMode('2D6'), true);
  c.trigger('tap');
  assert.strictEqual(c.setMode('1D20'), false, 'SHAKING 中禁止切换');
  clock.advance(500 + 200 + 1000);
  assert.strictEqual(c.setMode('1D20'), true, 'READY 后允许切换');
  assert.strictEqual(c.getMode(), '1D20');
});

test('RollController: destroy 清理定时器，无幽灵回调', function () {
  const clock = createFakeClock();
  const results = [];
  const c = makeController(clock, { onResult: function (r) { results.push(r); } });
  c.trigger('tap');
  c.destroy();
  clock.advance(5000);
  assert.strictEqual(results.length, 0, '销毁后不应有结果回调');
  assert.strictEqual(clock.pendingCount(), 0, '不应残留定时器');
});

test('RollController: SHAKING 中 destroy 后无回调，且可重新使用', function () {
  const clock = createFakeClock();
  const results = [];
  const c = makeController(clock, { onResult: function (r) { results.push(r); } });
  c.trigger('tap');
  c.destroy();
  clock.advance(5000);
  assert.strictEqual(results.length, 0, '销毁后旧定时器不得产出结果');
  // destroy 只清定时器，实例回到 READY 可继续使用（对应 onHide→onShow 复用）
  assert.strictEqual(c.getState(), 'READY');
  assert.strictEqual(c.trigger('tap'), true);
  clock.advance(500 + 200);
  assert.strictEqual(results.length, 1, '销毁后重新触发流程完整');
});

test('RollController: SETTLING 中 destroy 后回到 READY 并可接受新摇动', function () {
  const clock = createFakeClock();
  const results = [];
  const c = makeController(clock, { onResult: function (r) { results.push(r); } });
  c.onShakeStart();
  clock.advance(500);
  c.onShakeEnd();
  c.destroy();
  assert.strictEqual(c.getState(), 'READY', 'destroy 后状态应复位 READY');
  assert.strictEqual(c.onShakeStart(), true, 'destroy 后应可接受新摇动（对应页面复用）');
  assert.strictEqual(c.getState(), 'SHAKING', '新触发应开启新流程');
});

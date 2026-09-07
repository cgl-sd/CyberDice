const assert = require('assert');
const sensorMod = require('../../src/common/scripts/sensor-adapter.js');
const feedbackMod = require('../../src/common/scripts/feedback-service.js');

function makeMockSensor() {
  const mock = {
    subscribeCalls: 0,
    unsubscribeCalls: 0,
    failNext: null,
    handler: null,
    subscribeAccelerometer: function (opts) {
      mock.subscribeCalls += 1;
      mock.handler = opts;
      if (mock.failNext) {
        const err = mock.failNext;
        mock.failNext = null;
        opts.fail(err);
      }
    },
    unsubscribeAccelerometer: function () {
      mock.unsubscribeCalls += 1;
      mock.handler = null;
    },
  };
  return mock;
}

test('Lifecycle: start 幂等，不重复订阅（AC-13）', function () {
  const mock = makeMockSensor();
  const adapter = sensorMod.createSensorAdapter(mock);
  const samples = [];

  assert.strictEqual(adapter.start(function (s) { samples.push(s); }, null), true);
  assert.strictEqual(adapter.start(function () {}, null), false, '重复 start 应被拒绝');
  assert.strictEqual(mock.subscribeCalls, 1, '只订阅一次');

  mock.handler.success({ x: 1, y: 2, z: 3 });
  assert.strictEqual(samples.length, 1);
  assert.ok(samples[0].t > 0 && samples[0].x === 1 && samples[0].y === 2 && samples[0].z === 3);
});

test('Lifecycle: stop 取消订阅，重复 stop 安全；恢复后可重新订阅', function () {
  const mock = makeMockSensor();
  const adapter = sensorMod.createSensorAdapter(mock);

  adapter.start(function () {}, null);
  adapter.stop();
  assert.strictEqual(mock.unsubscribeCalls, 1, '退出页面取消订阅');
  adapter.stop();
  assert.strictEqual(mock.unsubscribeCalls, 1, '重复 stop 是 no-op');

  // 重复进入/退出页面：不累积订阅
  adapter.start(function () {}, null);
  adapter.stop();
  assert.strictEqual(mock.subscribeCalls, 2);
  assert.strictEqual(mock.unsubscribeCalls, 2);
});

test('Lifecycle: 订阅失败回调 onError 且不阻塞（FR-010 / AC-12）', function () {
  const mock = makeMockSensor();
  mock.failNext = { code: 202, message: 'unavailable' };
  const adapter = sensorMod.createSensorAdapter(mock);
  const errors = [];
  const ok = adapter.start(function () {}, function (e) { errors.push(e); });

  assert.strictEqual(ok, false, '同步失败时 start 返回 false');
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0].code, 202);
  assert.strictEqual(mock.subscribeCalls, 1, '失败不产生残留订阅');
  assert.strictEqual(adapter.isSubscribed(), false, '失败后应允许重试');
  assert.strictEqual(adapter.start(function () {}, null), true, '可重新订阅');
});

test('Lifecycle: 平台 API 缺失时进入错误回调，不抛异常', function () {
  const adapter = sensorMod.createSensorAdapter(null);
  const errors = [];
  const ok = adapter.start(function () {}, function (e) { errors.push(e); });
  assert.strictEqual(ok, false);
  assert.strictEqual(errors.length, 1);
});

test('Lifecycle: 快速 start/stop 循环 20 次无订阅累积', function () {
  const mock = makeMockSensor();
  const adapter = sensorMod.createSensorAdapter(mock);
  for (let i = 0; i < 20; i++) {
    adapter.start(function () {}, null);
    adapter.stop();
  }
  assert.strictEqual(mock.subscribeCalls, 20);
  assert.strictEqual(mock.unsubscribeCalls, 20);
  assert.strictEqual(adapter.isSubscribed(), false);
});

test('FeedbackService: 震动成功返回 true；平台异常被吞掉不崩溃（第 14 节）', function () {
  const good = feedbackMod.createFeedbackService({ vibrate: function () {} });
  assert.strictEqual(good.vibrate(), true);
  assert.ok(good.getLastVibrateAt() > 0);

  const throwing = feedbackMod.createFeedbackService({
    vibrate: function () { throw new Error('not supported'); },
  });
  assert.doesNotThrow(function () { throwing.vibrate(); });

  const missing = feedbackMod.createFeedbackService(null);
  assert.strictEqual(missing.vibrate(), false);
});

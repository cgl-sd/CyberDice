const assert = require('assert');
const storeMod = require('../../src/common/scripts/store.js');

/** 内存版 storage adapter（模拟 @system.storage 持久化行为） */
function makeMockStorage() {
  const disk = new Map();
  return {
    writes: 0,
    get(key, cb) { cb(disk.has(key) ? disk.get(key) : null); },
    set(key, value, cb) { disk.set(key, JSON.parse(JSON.stringify(value))); this.writes++; cb(true); },
  };
}

function waitLoad(store) {
  return new Promise((resolve) => store.load(resolve));
}

test('Store: setSetting 更新状态并持久化 + 通知', async function () {
  const store = storeMod.createStore(makeMockStorage());
  const events = [];
  store.on((what) => events.push(what));
  await waitLoad(store);
  store.setSetting('vibration', false);
  assert.strictEqual(store.getState().settings.vibration, false);
  assert.ok(events.includes('settings'));
});

test('Store: pushHistory 最新在前、上限 20 条、持久化', async function () {
  const store = storeMod.createStore(makeMockStorage());
  await waitLoad(store);
  for (let i = 1; i <= 25; i++) {
    store.pushHistory({ dice: [i % 6 + 1], total: i % 6 + 1 }, '1D6');
  }
  const h = store.getState().history;
  assert.strictEqual(h.length, 20, '历史上限 20 条');
  assert.ok(h[0].time.match(/^\d{2}:\d{2}$/), '时间格式 HH:MM');
  store.clearHistory();
  assert.strictEqual(store.getState().history.length, 0);
});

test('Store: 模式支持预设与自定义对象，load 恢复', async function () {
  const mock = makeMockStorage();
  const store = storeMod.createStore(mock);
  await waitLoad(store);
  store.setMode({ count: 3, sides: 8 });
  assert.strictEqual(store.getModeLabel(), '3D8');

  // 新实例从同一持久层恢复
  const store2 = storeMod.createStore(mock);
  await waitLoad(store2);
  assert.deepStrictEqual(store2.getState().mode, { count: 3, sides: 8 });
  assert.strictEqual(store2.getModeLabel(), '3D8');
});

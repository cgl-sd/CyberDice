/**
 * StorageAdapter：@system.storage 封装（平台适配层）
 * - 存储不可用时退化为内存 Map，应用功能不受阻（FR-010 原则）
 * - 全部异步回调，异常吞掉
 */

const memory = new Map();

function defaultStorageModule() {
  try {
    // eslint-disable-next-line import/no-unresolved
    return require('@system.storage');
  } catch (e) {
    return null;
  }
}

function createStorageAdapter(storageModule) {
  const storage = storageModule || defaultStorageModule();

  function get(key, cb) {
    cb = cb || function () {};
    try {
      if (!storage || typeof storage.get !== 'function') {
        cb(memory.has(key) ? memory.get(key) : null);
        return;
      }
      storage.get({
        key: key,
        success: function (data) {
          // @system.storage.get 的 success 直接回传存储值本身
          cb(data === undefined || data === null ? null : data);
        },
        fail: function () {
          cb(memory.has(key) ? memory.get(key) : null);
        },
      });
    } catch (e) {
      cb(memory.has(key) ? memory.get(key) : null);
    }
  }

  function set(key, value, cb) {
    cb = cb || function () {};
    memory.set(key, value); // 内存始终同步一份
    try {
      if (!storage || typeof storage.set !== 'function') {
        cb(true);
        return;
      }
      storage.set({
        key: key,
        value: value,
        success: function () { cb(true); },
        fail: function () { cb(false); },
      });
    } catch (e) {
      cb(false);
    }
  }

  return { get: get, set: set };
}

module.exports = { createStorageAdapter };

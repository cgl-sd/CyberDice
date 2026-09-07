/* 自动生成：node tmp/tools/build-sim-bundle.js。请勿手工编辑。 */
(function (global) {
  'use strict';
  const modules = Object.create(null);
  function define(name, sourceName, factory) {
    const module = { exports: {} };
    factory(function (specifier) {
      const key = specifier.split('/').pop().replace(/\.js$/, '');
      return modules[key];
    }, module, module.exports);
    modules[name] = module.exports;
    modules[sourceName] = module.exports;
  }
  define("constants", "constants", function (require, module, exports) {
/**
 * CyberDice 全局常量
 * 数值为首版默认值，真机调参阶段可按第 10.3 节方法调整。
 */

module.exports = {
  VERSION: '1.1.0',

  // 掷骰模式
  MODE_1D6: '1D6',
  MODE_2D6: '2D6',
  MODE_1D20: '1D20',
  MODES: ['1D6', '2D6', '1D20'],

  // 状态机（见说明书第 9 节）
  STATE_READY: 'READY',
  STATE_SHAKING: 'SHAKING',
  STATE_SETTLING: 'SETTLING',
  STATE_RESULT: 'RESULT',
  STATE_ERROR_SENSOR: 'ERROR_SENSOR',

  // 摇动识别（见说明书第 10.3 节）
  SHAKE: {
    // 进入 SHAKING：250ms 窗口内至少 N 个显著运动样本
    ENTER_WINDOW_MS: 250,
    ENTER_PEAK_COUNT: 3,
    // 显著运动判定：偏离基线的幅度阈值（设备输出单位待真机标定）
    ENTER_THRESHOLD: 3.0,
    // 静止基线 EMA 系数（越慢越稳定）
    BASELINE_ALPHA: 0.02,
    // 连续该时长无显著运动则判定摇动结束
    QUIET_MS: 350,
    // SETTLING 去抖时长
    SETTLING_MS: 200,
    // 页面恢复订阅后的基线稳定窗口；期间仍允许点击掷骰，但忽略摇动触发
    STARTUP_STABILIZE_MS: 600,
  },

  // 掷骰流程
  ROLL: {
    // 点击触发的动画时长（0.4~0.9s 区间内）
    TAP_ROLL_MS: 500,
    // 摇动触发的最短动画时长
    SHAKE_MIN_ROLL_MS: 400,
    // 结果展示时长：保证结果稳定显示 >= 1s，同时覆盖 500~800ms 冷却
    RESULT_MS: 1000,
  },

  // 动画：中间骰面刷新间隔
  ANIM_INTERVAL_MS: 80,

  // 传感器
  SENSOR: {
    INTERVAL: 'game', // 约 20ms/次
  },
};

  });

  define("dice", "dice-engine", function (require, module, exports) {
/**
 * DiceEngine：随机结果生成（说明书第 8、11 节 + UI 概念图扩展）
 * 传感器只决定"何时掷"，点数完全由随机函数生成，不引入摇动强度/方向偏置（NFR-07）。
 * N 骰必须逐颗独立生成，不得直接生成总和范围随机数（避免概率分布错误）。
 */

const PRESET = {
  '1D6': { count: 1, sides: 6 },
  '2D6': { count: 2, sides: 6 },
  '3D6': { count: 3, sides: 6 },
  '1D20': { count: 1, sides: 20 },
};

function randInt(min, max) {
  // [min, max] 闭区间均匀整数
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * 规范化模式：'1D6'/'2D6'/'3D6'/'1D20' 预设，或 { count, sides } 自定义。
 * 返回 { count, sides, label }；非法输入兜底为 1D6，不阻塞 UI（FR-010）。
 */
function normalizeMode(mode) {
  if (typeof mode === 'string' && PRESET[mode]) {
    return Object.assign({ label: mode }, PRESET[mode]);
  }
  if (mode && typeof mode === 'object') {
    const count = Math.min(6, Math.max(1, Math.floor(Number(mode.count) || 1)));
    const sides = Math.min(100, Math.max(2, Math.floor(Number(mode.sides) || 6)));
    return { count: count, sides: sides, label: count + 'D' + sides };
  }
  return { count: 1, sides: 6, label: '1D6' };
}

function modeLabel(mode) {
  return normalizeMode(mode).label;
}

/**
 * roll(mode) -> { dice: number[], total: number }
 * @param {string|{count:number,sides:number}} mode
 */
function roll(mode) {
  const m = normalizeMode(mode);
  const dice = [];
  for (let i = 0; i < m.count; i++) {
    dice.push(randInt(1, m.sides));
  }
  const total = dice.reduce(function (a, b) { return a + b; }, 0);
  return { dice: dice, total: total };
}

/** 供动画使用的中间随机骰面（不是最终抽样） */
function rollAnimFace(mode) {
  return roll(mode).dice;
}

module.exports = { roll, rollAnimFace, randInt, normalizeMode, modeLabel, PRESET };

  });

  define("shake-detector", "shake-detector", function (require, module, exports) {
/**
 * ShakeDetector：摇动识别（说明书第 8、10 节）
 *
 * 原则：加速度计只负责判断"是否发生一次明确摇动"，不参与随机结果计算。
 *
 * 特征：
 *   m(t)    = sqrt(x² + y² + z²)
 *   d(t)    = |m(t) - baseline|
 *   baseline 用慢速 EMA 从真机样本自适应估计，不硬编码单位（10.2 节）。
 *
 * 首版策略（10.3 节）：
 *   1. IDLE：enterWindowMs 窗口内出现 >= enterPeakCount 个显著运动样本 -> SHAKE_START
 *   2. SHAKING：显著运动刷新 lastMotionAt
 *   3. 连续 quietMs 无显著运动 -> SHAKE_END
 *   4. 结束后的去抖（SETTLING）由 RollController 处理；若 SETTLING 期间再次出现
 *      显著运动，Detector 会重新发出 SHAKE_START，Controller 据此回到 SHAKING。
 */

const C = require('./constants.js');

const SHAKE_DEFAULTS = {
  enterWindowMs: 250,
  enterPeakCount: 3,
  enterThreshold: 3.0,
  baselineAlpha: 0.02,
  quietMs: 350,
  warmupMs: C.SHAKE.STARTUP_STABILIZE_MS,
};

function createShakeDetector(config) {
  const cfg = Object.assign({}, SHAKE_DEFAULTS, config || {});
  const EV = { SHAKE_START: 'SHAKE_START', SHAKE_END: 'SHAKE_END' };

  let state = 'IDLE'; // IDLE | SHAKING
  let baseline = null;
  let recentPeaks = []; // 窗口内显著运动样本的时间戳
  let lastMotionAt = 0;
  let warmupStartedAt = null;

  function magnitude(s) {
    return Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
  }

  function reset() {
    state = 'IDLE';
    baseline = null;
    recentPeaks = [];
    lastMotionAt = 0;
    warmupStartedAt = null;
  }

  function updateBaseline(m) {
    if (baseline === null) {
      baseline = m;
    } else {
      baseline = baseline + cfg.baselineAlpha * (m - baseline);
    }
  }

  /**
   * pushSample({ t, x, y, z }) -> event | null
   * event: 'SHAKE_START' | 'SHAKE_END'
   */
  function pushSample(sample) {
    const t = sample.t;
    const m = magnitude(sample);
    if (warmupStartedAt === null) {
      warmupStartedAt = t;
    }
    updateBaseline(m);

    // 订阅刚恢复时，先让 EMA 建立静止基线；防止抬腕打开应用的动作直接掷骰。
    if (t - warmupStartedAt < cfg.warmupMs) {
      return null;
    }

    const significant = Math.abs(m - baseline) > cfg.enterThreshold;

    if (state === 'IDLE') {
      if (!significant) {
        return null;
      }
      recentPeaks.push(t);
      recentPeaks = recentPeaks.filter(function (ts) {
        return t - ts <= cfg.enterWindowMs;
      });
      if (recentPeaks.length >= cfg.enterPeakCount) {
        state = 'SHAKING';
        lastMotionAt = t;
        recentPeaks = [];
        return EV.SHAKE_START;
      }
      return null;
    }

    // state === 'SHAKING'
    if (significant) {
      lastMotionAt = t;
      return null;
    }
    if (t - lastMotionAt >= cfg.quietMs) {
      state = 'IDLE';
      return EV.SHAKE_END;
    }
    return null;
  }

  return {
    pushSample: pushSample,
    reset: reset,
    getState: function () {
      return state;
    },
  };
}

module.exports = { createShakeDetector, SHAKE_DEFAULTS };

  });

  define("roll-controller", "roll-controller", function (require, module, exports) {
/**
 * RollController：掷骰流程与状态机（说明书第 8、9 节）
 *
 * READY -> SHAKING -> SETTLING -> RESULT -> READY
 *
 * - trigger('tap') / onShakeStart() 两种来源共用同一结果流程（FR-005/008）
 * - 防重入：SHAKING / SETTLING / RESULT 期间忽略一切新触发（冷却防重复，AC-08）
 * - SETTLING 期间重新出现摇动（SHAKE_START）则回到 SHAKING（10.3 节第 4 步）
 * - 结果只在 RESULT 进入时生成一次；动画中间值与随机抽样无关（第 11 节）
 *
 * 时间与定时器均可注入，便于单元测试。
 */

const C = require('./constants.js');

const DEFAULTS = {
  tapRollMs: C.ROLL.TAP_ROLL_MS,
  shakeMinRollMs: C.ROLL.SHAKE_MIN_ROLL_MS,
  settlingMs: C.SHAKE.SETTLING_MS,
  resultMs: C.ROLL.RESULT_MS,
};

function createRollController(opts) {
  const cfg = Object.assign({}, DEFAULTS, opts && opts.config ? opts.config : {});
  const diceEngine = opts.diceEngine;
  const feedback = opts.feedback || { vibrate: function () {} };
  const now = opts.now || Date.now;
  const setTimeoutFn = opts.setTimeout || setTimeout;
  const clearTimeoutFn = opts.clearTimeout || clearTimeout;

  const onStateChange = opts.onStateChange || function () {};
  const onResult = opts.onResult || function () {};

  let state = C.STATE_READY;
  let mode = (opts && opts.mode) || C.MODE_1D6;
  let source = null; // 'shake' | 'tap'
  let lastResult = null;
  let rollStartedAt = 0;
  let settleTimer = null;
  let resultTimer = null;
  let tapTimer = null;

  function transition(next, ctx) {
    state = next;
    onStateChange(next, ctx || {});
  }

  function clearTimers() {
    if (settleTimer) {
      clearTimeoutFn(settleTimer);
      settleTimer = null;
    }
    if (resultTimer) {
      clearTimeoutFn(resultTimer);
      resultTimer = null;
    }
    if (tapTimer) {
      clearTimeoutFn(tapTimer);
      tapTimer = null;
    }
  }

  function isBusy() {
    return state !== C.STATE_READY;
  }

  function startRoll(src) {
    if (isBusy()) {
      return false; // 防重入 / 冷却
    }
    source = src;
    rollStartedAt = now();
    transition(C.STATE_SHAKING, { source: src });
    if (src === 'tap') {
      // 点击触发：固定动画时长后自动收束
      tapTimer = setTimeoutFn(function () {
        tapTimer = null;
        onTapRollDone();
      }, cfg.tapRollMs);
    }
    return true;
  }

  function scheduleSettle(delayMs) {
    if (settleTimer) {
      return;
    }
    settleTimer = setTimeoutFn(function () {
      settleTimer = null;
      if (state !== C.STATE_SETTLING) {
        return;
      }
      finishRoll();
    }, delayMs);
  }

  function finishRoll() {
    const result = diceEngine.roll(mode); // 最终结果只生成一次
    lastResult = result;
    transition(C.STATE_RESULT, { result: result, source: source });
    try {
      feedback.vibrate(); // 结果锁定时短震一次（FR-007）
    } catch (e) {
      // 震动失败吞掉异常，不阻塞 UI（第 14 节）
    }
    onResult(result, source);

    resultTimer = setTimeoutFn(function () {
      resultTimer = null;
      source = null;
      transition(C.STATE_READY, {});
    }, cfg.resultMs);
  }

  /** 点击主区域触发（FR-008） */
  function trigger(src) {
    if (src !== 'tap' && src !== 'shake') {
      return false;
    }
    return startRoll(src);
  }

  /** Detector 发出 SHAKE_START */
  function onShakeStart() {
    if (state === C.STATE_SETTLING) {
      // SETTLING 去抖期间重新出现强运动 -> 回到 SHAKING
      if (settleTimer) {
        clearTimeoutFn(settleTimer);
        settleTimer = null;
      }
      transition(C.STATE_SHAKING, { source: 'shake' });
      return true;
    }
    return startRoll('shake');
  }

  /** Detector 发出 SHAKE_END */
  function onShakeEnd() {
    if (state !== C.STATE_SHAKING || source !== 'shake') {
      return false;
    }
    transition(C.STATE_SETTLING, { source: 'shake' });
    // 保证最短动画时长
    const elapsed = now() - rollStartedAt;
    const delay = Math.max(cfg.settlingMs, cfg.shakeMinRollMs - elapsed);
    scheduleSettle(delay);
    return true;
  }

  /** 点击触发的自动收束 */
  function onTapRollDone() {
    if (state !== C.STATE_SHAKING || source !== 'tap') {
      return false;
    }
    transition(C.STATE_SETTLING, { source: 'tap' });
    scheduleSettle(cfg.settlingMs);
    return true;
  }

  function setMode(next) {
    if (isBusy()) {
      return false; // 摇动/结算过程中禁止切换（7.3 节）
    }
    mode = next;
    return true;
  }

  function getMode() {
    return mode;
  }

  function getState() {
    return state;
  }

  function getLastResult() {
    return lastResult;
  }

  /** 页面销毁时清理定时器，避免幽灵回调 */
  function destroy() {
    clearTimers();
    state = C.STATE_READY;
  }

  return {
    trigger: trigger,
    onShakeStart: onShakeStart,
    onShakeEnd: onShakeEnd,
    onTapRollDone: onTapRollDone,
    setMode: setMode,
    getMode: getMode,
    getState: getState,
    getLastResult: getLastResult,
    isBusy: isBusy,
    destroy: destroy,
  };
}

module.exports = { createRollController };

  });

  define("sensor-adapter", "sensor-adapter", function (require, module, exports) {
/**
 * SensorAdapter：@system.sensor 封装（说明书第 8 节 Platform Adapter）
 *
 * - 仅前台页面生命周期内 start()；onHide/onDestroy 必须 stop()（FR-009 / NFR-05）
 * - start() 幂等：已订阅时不再重复订阅（AC-13）
 * - 订阅失败回调 onError，页面进入点击兜底模式（FR-010 / AC-12）
 *
 * sensorModule 可注入用于单元测试；默认在快应用环境中 require('@system.sensor')。
 */

function defaultSensorModule() {
  try {
    // eslint-disable-next-line import/no-unresolved
    return require('@system.sensor');
  } catch (e) {
    return null;
  }
}

function createSensorAdapter(sensorModule) {
  const sensor = sensorModule || defaultSensorModule();
  let subscribed = false;

  /**
   * start(onSample, onError)
   * onSample: ({ t, x, y, z })
   * onError:  ({ code, message })
   * 返回 true 表示成功发起订阅。
   */
  function start(onSample, onError) {
    if (subscribed) {
      return false; // 无重复订阅
    }
    if (!sensor || typeof sensor.subscribeAccelerometer !== 'function') {
      if (onError) {
        onError({ code: -1, message: 'sensor API unavailable' });
      }
      return false;
    }
    let syncFailed = false;
    try {
      sensor.subscribeAccelerometer({
        interval: 'game',
        success: function (data) {
          if (!subscribed) {
            return;
          }
          onSample({
            t: Date.now(),
            x: data.x,
            y: data.y,
            z: data.z,
          });
        },
        fail: function (err) {
          subscribed = false;
          syncFailed = true;
          if (onError) {
            onError({ code: err && err.code, message: 'subscribeAccelerometer fail' });
          }
        },
      });
      subscribed = !syncFailed;
      return subscribed;
    } catch (e) {
      subscribed = false;
      if (onError) {
        onError({ code: -2, message: String(e) });
      }
      return false;
    }
  }

  /** stop()：取消订阅；未订阅时为安全 no-op */
  function stop() {
    if (!subscribed) {
      return;
    }
    subscribed = false;
    try {
      if (sensor && typeof sensor.unsubscribeAccelerometer === 'function') {
        sensor.unsubscribeAccelerometer();
      }
    } catch (e) {
      // 忽略取消订阅异常，避免阻塞页面销毁
    }
  }

  function isSubscribed() {
    return subscribed;
  }

  return { start: start, stop: stop, isSubscribed: isSubscribed };
}

module.exports = { createSensorAdapter };

  });

  define("feedback", "feedback-service", function (require, module, exports) {
/**
 * FeedbackService：震动反馈封装（说明书第 8、14 节）
 * - 结果锁定时短震一次（FR-007）
 * - 平台异常必须吞掉，只损失触觉反馈，不影响结果显示（AC-12）
 */

function defaultVibratorModule() {
  try {
    // eslint-disable-next-line import/no-unresolved
    return require('@system.vibrator');
  } catch (e) {
    return null;
  }
}

function createFeedbackService(vibratorModule) {
  const vibrator = vibratorModule || defaultVibratorModule();
  let lastVibrateAt = 0;

  /** 结果锁定时的单次短震；调用方保证每次结果只调用一次 */
  function vibrate() {
    try {
      if (!vibrator || typeof vibrator.vibrate !== 'function') {
        return false;
      }
      // 基础 vibrate；不依赖 start/stop 高级接口（第 6 节）
      vibrator.vibrate({ mode: 'short' });
      lastVibrateAt = Date.now();
      return true;
    } catch (e) {
      try {
        // 某些固件不支持 mode 参数，退回无参调用
        if (vibrator && typeof vibrator.vibrate === 'function') {
          vibrator.vibrate();
          lastVibrateAt = Date.now();
          return true;
        }
      } catch (e2) {
        // 完全失败：吞掉异常
      }
      return false;
    }
  }

  return {
    vibrate: vibrate,
    getLastVibrateAt: function () {
      return lastVibrateAt;
    },
  };
}

module.exports = { createFeedbackService };

  });

  define("storage-adapter", "storage-adapter", function (require, module, exports) {
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

  });

  define("store", "store", function (require, module, exports) {
/**
 * store：应用级共享状态（跨页面）
 * - settings：震动反馈 / 动画效果 / 主题强调色
 * - mode：当前骰子模式（预设字符串或 {count,sides}）
 * - history：最近投掷记录（最多 20 条）
 * 通过 storage-adapter 持久化；页面通过 on() 订阅变更。
 */

const diceEngine = require('./dice-engine.js');

const ACCENTS = {
  blue: '#2f6bed',
  green: '#2fbf6b',
  purple: '#8a5cf6',
};

const HISTORY_KEY = 'cyberdice_history';
const SETTINGS_KEY = 'cyberdice_settings';
const MODE_KEY = 'cyberdice_mode';
const MAX_HISTORY = 20;

function createStore(storageAdapter) {
  const storage = storageAdapter;
  const listeners = [];

  const state = {
    settings: { vibration: true, animation: true, accent: 'blue' },
    mode: '1D6',
    history: [], // { label, dice, total, time: 'HH:MM' }
    rollState: 'READY', // READY | SHAKING | SETTLING | RESULT
    rollCtx: null,
    loaded: false,
  };

  function notify(what) {
    listeners.forEach(function (fn) {
      try {
        fn(what, state);
      } catch (e) {
        // 单个订阅者异常不影响其他
      }
    });
  }

  function on(fn) {
    listeners.push(fn);
    return function off() {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function currentTimeHM() {
    const d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  /** 启动时从持久层恢复 */
  function load(done) {
    done = done || function () {};
    let pending = 3;
    const fin = function () {
      state.loaded = true;
      notify('load');
      done(state);
    };
    const dec = function () {
      if (--pending === 0) fin();
    };
    storage.get(SETTINGS_KEY, function (v) {
      if (v && typeof v === 'object') {
        state.settings = {
          vibration: v.vibration !== false,
          animation: v.animation !== false,
          accent: ACCENTS[v.accent] ? v.accent : 'blue',
        };
      }
      dec();
    });
    storage.get(HISTORY_KEY, function (v) {
      if (Array.isArray(v)) state.history = v.slice(0, MAX_HISTORY);
      dec();
    });
    storage.get(MODE_KEY, function (v) {
      if (v) state.mode = v; // 字符串预设或 {count,sides}
      dec();
    });
  }

  function setSetting(key, value) {
    state.settings[key] = value;
    storage.set(SETTINGS_KEY, state.settings);
    notify('settings');
  }

  function setMode(mode) {
    state.mode = diceEngine.normalizeMode(mode).label ? mode : '1D6';
    storage.set(MODE_KEY, mode);
    notify('mode');
  }

  /** 应用级 RollController 状态广播，home 页订阅渲染 */
  function setRollState(s, ctx) {
    state.rollState = s;
    state.rollCtx = ctx || null;
    notify('rollState');
  }

  function getModeLabel() {
    return diceEngine.modeLabel(state.mode);
  }

  /** 每次结果锁定时调用；新记录插到最前 */
  function pushHistory(result, mode) {
    state.history.unshift({
      label: diceEngine.modeLabel(mode),
      dice: result.dice,
      total: result.total,
      time: currentTimeHM(),
    });
    if (state.history.length > MAX_HISTORY) {
      state.history.length = MAX_HISTORY;
    }
    storage.set(HISTORY_KEY, state.history);
    notify('history');
  }

  function clearHistory() {
    state.history = [];
    storage.set(HISTORY_KEY, state.history);
    notify('history');
  }

  return {
    on: on,
    load: load,
    setSetting: setSetting,
    setMode: setMode,
    setRollState: setRollState,
    getModeLabel: getModeLabel,
    pushHistory: pushHistory,
    clearHistory: clearHistory,
    getState: function () { return state; },
    ACCENTS: ACCENTS,
  };
}

module.exports = { createStore, ACCENTS, MAX_HISTORY };

  });

  global.CyberDiceModules = modules;
}(window));

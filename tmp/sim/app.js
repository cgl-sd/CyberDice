/**
 * CyberDice 浏览器模拟器（UI 概念图版）
 * 通过极简 CommonJS shim 加载 src/common 下的真实逻辑模块（含 store），
 * 用 mock 的 @system.sensor / @system.vibrator / storage 驱动完整链路，
 * UI 复刻概念图 7 屏：home / dice-select / custom / history / settings / theme / about。
 */

'use strict';

// ---- 平台 mock ----
const mockSensor = {
  subscribeCalls: 0,
  unsubscribeCalls: 0,
  handler: null,
  failMode: false,
  subscribeAccelerometer(opts) {
    this.subscribeCalls += 1;
    if (this.failMode) {
      opts.fail({ code: 202, message: 'injected failure' });
      return;
    }
    this.handler = opts;
  },
  unsubscribeAccelerometer() {
    this.unsubscribeCalls += 1;
    this.handler = null;
  },
};

const mockVibrator = {
  vibrateCalls: 0,
  vibrate() {
    this.vibrateCalls += 1;
  },
};

// 浏览器版持久层：实现 @system.storage 的对象参数风格（get/set 接收 {key,...}），
// 底层落到 localStorage；并清理历史版本写坏的键。
const browserStorage = {
  get(opts) {
    try {
      const raw = localStorage.getItem('cyberdice.' + opts.key);
      opts.success && opts.success(raw === null ? null : JSON.parse(raw));
    } catch (e) {
      opts.fail && opts.fail(e);
    }
  },
  set(opts) {
    try {
      localStorage.setItem('cyberdice.' + opts.key, JSON.stringify(opts.value));
      opts.success && opts.success();
    } catch (e) {
      opts.fail && opts.fail(e);
    }
  },
};
try {
  localStorage.removeItem('cyberdice.[object Object]');
} catch (e) { /* 忽略 */ }

const registry = {
  '@system.sensor': mockSensor,
  '@system.vibrator': mockVibrator,
};

const M = {};

async function loadModule(url, key) {
  const code = await (await fetch(url)).text();
  const module = { exports: {} };
  const fn = new Function('require', 'module', 'exports', code);
  fn((name) => registry[name] || M[name] || M[name.split('/').pop()], module, module.exports);
  M[url.split('/').pop()] = module.exports;
  if (key) M[key] = module.exports;
}

// ---- 概念图配色 ----
const ACCENT_COLORS = { blue: '#2f6bed', green: '#2fbf6b', purple: '#8a5cf6' };

// ---- 简易路由 ----
const stack = ['home'];
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById('scr-' + id).classList.add('active');
  document.querySelectorAll('#scr-' + id + ' .list').forEach((l) => { l.scrollTop = 0; });
  if (id === 'dice-select') renderDiceSelect();
  if (id === 'history') renderHistory();
  if (id === 'settings') renderSettings();
  if (id === 'theme') renderTheme();
}
function navigate(id) {
  if (stack[stack.length - 1] === id) return;
  stack.push(id);
  show(id);
}
function goBack() {
  if (stack.length > 1) stack.pop();
  show(stack[stack.length - 1]);
}

// ---- 渲染辅助 ----
const el = (id) => document.getElementById(id);
const checkHTML = (on) =>
  on
    ? '<div class="check-circle"><span class="check-glyph">✓</span></div>'
    : '<div class="check-ring"></div>';

function log(msg) {
  const box = el('log');
  const line = '[' + ((Date.now() - t0) / 1000).toFixed(1) + 's] ' + msg + '\n';
  box.textContent += line;
  box.scrollTop = box.scrollHeight;
}

// ---- 应用级单例（对应 app.ux） ----
let store, feedback, detector, controller, app;
let animTimer = null;
let feedTimer = null;
let t0 = Date.now();
let lastFinal = 5;
let tick = 0;
let sensorFallback = false;

const dieSrcOf = (v) => '/src/common/images/dice/die-' + v + '.png';
const shakeSrcOf = (frame) => '/src/common/images/dice/shake-' + frame + '.png';

function createApp() {
  const storageAdapter = M['storage-adapter'].createStorageAdapter(browserStorage);
  store = M['store'].createStore(storageAdapter);
  feedback = M['feedback'].createFeedbackService(mockVibrator);
  detector = M['shake-detector'].createShakeDetector();
  let vibCount = 0;
  controller = M['roll-controller'].createRollController({
    diceEngine: M['dice'],
    feedback: {
      vibrate() {
        if (store.getState().settings.vibration) {
          vibCount++;
          mockVibrator.vibrate();
        }
      },
    },
    onStateChange(s, ctx) {
      store.setRollState(s, ctx);
      if (s === 'RESULT' && ctx && ctx.result) {
        log('RESULT: ' + JSON.stringify(ctx.result));
        store.pushHistory(ctx.result, store.getState().mode);
      }
    },
  });
  app = {
    store: store,
    detector: detector,
    controller: controller,
    selectMode(mode) {
      if (!controller.setMode(mode)) {
        log('模式切换被拒绝（摇动/结算过程中禁止切换）');
        return false;
      }
      store.setMode(mode);
      return true;
    },
  };
  store.load(() => {
    controller.setMode(store.getState().mode);
    log('store loaded: mode=' + store.getModeLabel() + ' history=' + store.getState().history.length);
  });
}

// ---- 首页渲染（对应 home.ux） ----
function syncHome() {
  const st = store.getState();
  el('modeLabel').textContent = M['dice'].modeLabel(st.mode);

  if (st.rollState === 'RESULT' && st.rollCtx && st.rollCtx.result) {
    stopAnim();
    const r = st.rollCtx.result;
    lastFinal = r.dice[0];
    el('resultWrap').style.display = '';
    el('dieImg').style.display = 'none';
    el('resultNum').textContent = r.dice.length === 1 ? String(r.dice[0]) : String(r.total);
    el('resultSub').textContent = r.dice.length > 1 ? r.dice.join(' + ') + ' =' : '';
    el('hint').textContent = '点击屏幕 或 摇一摇手腕';
  } else if (st.rollState === 'SHAKING' || st.rollState === 'SETTLING') {
    startAnim();
    el('hint').textContent = '摇动中…';
  } else {
    stopAnim();
    el('resultWrap').style.display = 'none';
    el('dieImg').style.display = '';
    el('dieImg').src = dieSrcOf(lastFinal);
    el('hint').textContent = sensorFallback ? '传感器不可用 · 点击掷骰' : '摇一摇手腕 或 点击掷骰';
  }
}

function startAnim() {
  if (animTimer || !store.getState().settings.animation) return;
  animTimer = setInterval(() => {
    tick += 1;
    el('dieImg').className = tick % 2 ? 'die-shake-l' : 'die-shake-r';
    el('dieImg').src = shakeSrcOf(tick % 4 + 1);
  }, 80);
}

function stopAnim() {
  if (animTimer) {
    clearInterval(animTimer);
    animTimer = null;
  }
  el('dieImg').className = 'die-img';
}

// ---- 右滑后的功能入口 ----
const PRESETS = ['1D6', '2D6', '3D6', '1D20'];

function renderDiceSelect() {
  const mode = store.getState().mode;
  const selected = typeof mode === 'string' ? mode : '';
  const isCustom = typeof mode === 'object';
  const list = el('presetList');
  list.innerHTML = '';
  PRESETS.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = '<span class="item-label">' + p + '</span>' + checkHTML(selected === p);
    row.onclick = () => {
      app.selectMode(p);
      log('mode -> ' + p);
      goBack();
    };
    list.appendChild(row);
  });
  const custom = document.createElement('div');
  custom.className = 'list-item';
  custom.innerHTML = '<span class="item-label">自定义</span>' + checkHTML(isCustom);
  custom.onclick = () => navigate('custom');
  list.appendChild(custom);
  const settings = document.createElement('div');
  settings.className = 'list-item';
  settings.innerHTML = '<span class="item-label">偏好设置</span><span class="item-chevron">›</span>';
  settings.onclick = () => navigate('settings');
  list.appendChild(settings);
  const history = document.createElement('div');
  history.className = 'list-item';
  history.innerHTML = '<span class="item-label">历史记录</span><span class="item-chevron">›</span>';
  history.onclick = () => navigate('history');
  list.appendChild(history);
}

// ---- 自定义页 ----
const SIDE_OPTIONS = [4, 6, 8, 12, 20, 100];
let customCount = 2;
let customSideIndex = 1;

function syncCustom() {
  el('cntVal').textContent = customCount;
  el('sideVal').textContent = 'D' + SIDE_OPTIONS[customSideIndex];
  el('customPreview').textContent = '当前模式：' + customCount + 'D' + SIDE_OPTIONS[customSideIndex];
}

// ---- 历史页 ----
function renderHistory() {
  const items = store.getState().history;
  const has = items.length > 0;
  el('historyEmpty').style.display = has ? 'none' : '';
  el('historyList').style.display = has ? '' : 'none';
  el('clearHistory').style.display = has ? '' : 'none';
  const list = el('historyList');
  list.innerHTML = '';
  items.forEach((h) => {
    const row = document.createElement('div');
    row.className = 'history-item';
    row.innerHTML =
      '<span class="history-value">' + h.total + '</span>' +
      '<div class="history-mid"><span class="history-mode">' + h.label + '</span>' +
      '<span class="history-detail">' + (h.dice.length > 1 ? h.dice.join('+') + '=' + h.total : '&nbsp;') + '</span></div>' +
      '<span class="history-time">' + h.time + '</span>';
    list.appendChild(row);
  });
}

// ---- 设置页 ----
function renderSettings() {
  const s = store.getState().settings;
  el('tglVibration').className = 'toggle ' + (s.vibration ? 'on' : 'off');
  el('tglAnimation').className = 'toggle ' + (s.animation ? 'on' : 'off');
}

// ---- 主题页 ----
function renderTheme() {
  const current = store.getState().settings.accent;
  const list = el('themeList');
  list.innerHTML = '';
  const names = { blue: '科技蓝', green: '极客绿', purple: '赛博紫' };
  Object.keys(ACCENT_COLORS).forEach((key) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    const on = current === key;
    row.innerHTML =
      '<span class="item-label">' + names[key] + '</span>' +
      (on
        ? '<div class="check-circle" style="background:' + ACCENT_COLORS[key] + '"><span class="check-glyph">✓</span></div>'
        : '<div class="check-ring"></div>');
    row.onclick = () => {
      store.setSetting('accent', key);
      document.documentElement.style.setProperty('--accent', ACCENT_COLORS[key]);
      log('accent -> ' + key);
      renderTheme();
    };
    list.appendChild(row);
  });
}

// ---- 传感器信号注入 ----
let waveFn = null, waveStart = 0, waveDur = 0, waveLabel = '', waveI = 0;
let feedUntil = 0;
const FEED_INTERVAL_MS = 20;
const STARTUP_CALIBRATION_MS = 700;
const POST_WAVE_IDLE_MS = 420;

function idleSample() {
  return { x: 0, y: 0, z: 9.8 + Math.sin(Math.random() * 6) * 0.2 };
}

function startFeed(durationMs) {
  feedUntil = Math.max(feedUntil, Date.now() + durationMs);
  if (feedTimer) return;
  feedTimer = setInterval(() => {
    if (!mockSensor.handler) return;
    let v;
    const now = Date.now();
    if (waveFn && now - waveStart < waveDur) {
      v = waveFn(waveI++, (now - waveStart) / 1000);
    } else {
      if (waveFn) {
        log((waveLabel || '手势') + ' 注入结束');
        waveFn = null;
      }
      v = idleSample();
    }
    mockSensor.handler.success({ x: v.x, y: v.y, z: v.z });
    // 浏览器模拟不需要像真机一样永久采样；校准/手势后的静止样本足够驱动状态机。
    if (!waveFn && Date.now() >= feedUntil) stopFeed();
  }, FEED_INTERVAL_MS);
}

function stopFeed() {
  if (feedTimer) clearInterval(feedTimer);
  feedTimer = null;
  feedUntil = 0;
}

function injectWave(fn, durationMs, label) {
  if (waveFn) {
    log('上一个手势仍在注入中，忽略');
    return;
  }
  log(label + ' 开始（持续 ' + durationMs + 'ms）');
  waveFn = fn;
  waveStart = Date.now();
  waveDur = durationMs;
  waveLabel = label;
  waveI = 0;
  startFeed(durationMs + POST_WAVE_IDLE_MS);
}

function onSample(s) {
  const ev = detector.pushSample(s);
  if (ev === 'SHAKE_START') {
    log('detector -> SHAKE_START');
    controller.onShakeStart();
  } else if (ev === 'SHAKE_END') {
    log('detector -> SHAKE_END');
    controller.onShakeEnd();
  }
}

function onSensorError(e) {
  sensorFallback = true;
  log('sensor error: ' + JSON.stringify(e) + ' → 点击兜底');
  syncHome();
}

// ---- 生命周期 ----
function onHide() {
  stopAnim();
  stopFeed();
  waveFn = null;
  sensorAdapter.stop();
  log('onHide: 传感器已退订');
}
function onShow() {
  detector.reset();
  sensorFallback = false;
  sensorAdapter.start(onSample, onSensorError);
  // 为 ShakeDetector 的启动稳定窗口提供有限的静止基线样本，然后停止空闲轮询。
  startFeed(STARTUP_CALIBRATION_MS);
  log('onShow: 重新订阅');
  syncHome();
}

let sensorAdapter;

async function main() {
  const loads = [
    ['../../src/common/scripts/constants.js', 'constants'],
    ['../../src/common/scripts/dice-engine.js', 'dice'],
    ['../../src/common/scripts/shake-detector.js', 'shake-detector'],
    ['../../src/common/scripts/roll-controller.js', 'roll-controller'],
    ['../../src/common/scripts/sensor-adapter.js', 'sensor-adapter'],
    ['../../src/common/scripts/feedback-service.js', 'feedback'],
    ['../../src/common/scripts/storage-adapter.js', 'storage-adapter'],
    ['../../src/common/scripts/store.js', 'store'],
  ];
  for (const [url, key] of loads) {
    await loadModule(url, key);
  }
  createApp();
  sensorAdapter = M['sensor-adapter'].createSensorAdapter(mockSensor);

  // 首页交互
  el('diceArea').onclick = () => {
    controller.trigger('tap');
  };
  el('modeCard').onclick = () => navigate('dice-select');
  document.querySelectorAll('[data-nav]').forEach((b) => {
    if (!b.classList.contains('util-btn')) {
      b.onclick = () => navigate(b.getAttribute('data-nav'));
    }
  });
  store.on((what) => {
    if (what === 'rollState' || what === 'mode' || what === 'settings') syncHome();
    if (what === 'settings') {
      if (stack[stack.length - 1] === 'settings') renderSettings();
      if (stack[stack.length - 1] === 'theme') renderTheme();
    }
    if (what === 'history') {
      if (stack[stack.length - 1] === 'history') renderHistory();
    }
  });

  // 自定义页
  el('cntDec').onclick = () => { if (customCount > 1) { customCount--; syncCustom(); } };
  el('cntInc').onclick = () => { if (customCount < 6) { customCount++; syncCustom(); } };
  el('sideDec').onclick = () => { customSideIndex = (customSideIndex + SIDE_OPTIONS.length - 1) % SIDE_OPTIONS.length; syncCustom(); };
  el('sideInc').onclick = () => { customSideIndex = (customSideIndex + 1) % SIDE_OPTIONS.length; syncCustom(); };
  el('customConfirm').onclick = () => {
    const mode = { count: customCount, sides: SIDE_OPTIONS[customSideIndex] };
    app.selectMode(mode);
    log('mode -> ' + M['dice'].modeLabel(mode));
    goBack();
  };
  syncCustom();

  // 历史页
  el('clearHistory').onclick = () => {
    store.clearHistory();
    log('history cleared');
  };

  // 设置页
  el('settingVibration').onclick = () => store.setSetting('vibration', !store.getState().settings.vibration);
  el('settingAnimation').onclick = () => store.setSetting('animation', !store.getState().settings.animation);

  // 首页手势：上滑查看历史、右滑打开功能入口；左滑模拟系统返回。
  const device = el('device');
  const SWIPE_DISTANCE = 56;
  const SWIPE_DIRECTION_RATIO = 1.2;
  let gesture = null;
  const pointOf = (event) => {
    const touch = event.changedTouches && event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : { x: event.clientX, y: event.clientY };
  };
  const beginGesture = (event) => {
    const p = pointOf(event);
    if (typeof p.x !== 'number') return;
    gesture = { x: p.x, y: p.y };
  };
  const routeSwipe = (dx, dy) => {
    if (controller.isBusy()) return;
    const horizontal = Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) >= Math.abs(dy) * SWIPE_DIRECTION_RATIO;
    const upward = -dy >= SWIPE_DISTANCE && Math.abs(dy) >= Math.abs(dx) * SWIPE_DIRECTION_RATIO;
    if (horizontal && dx < 0) {
      // 子页面回退；首页交给宿主浏览器/系统处理退出。
      if (stack.length > 1) goBack();
      return;
    }
    if (stack[stack.length - 1] !== 'home') return;
    if (!horizontal && !upward) return;
    if (upward) navigate('history');
    if (horizontal && dx > 0) navigate('dice-select');
  };
  const endGesture = (event) => {
    if (!gesture) return;
    const start = gesture;
    gesture = null;
    const p = pointOf(event);
    routeSwipe(p.x - start.x, p.y - start.y);
  };
  const cancelGesture = () => { gesture = null; };
  if (window.PointerEvent) {
    device.addEventListener('pointerdown', beginGesture);
    device.addEventListener('pointerup', endGesture);
    device.addEventListener('pointercancel', cancelGesture);
  } else {
    device.addEventListener('touchstart', beginGesture, { passive: true });
    device.addEventListener('touchend', endGesture, { passive: true });
    device.addEventListener('touchcancel', cancelGesture, { passive: true });
    device.addEventListener('mousedown', beginGesture);
    device.addEventListener('mouseup', endGesture);
  }

  // 控制面板直接复用同一套手势路由，方便桌面浏览器测试。
  el('btnSwipeUp').onclick = () => routeSwipe(0, -SWIPE_DISTANCE);
  el('btnSwipeRight').onclick = () => routeSwipe(SWIPE_DISTANCE, 0);
  el('btnSwipeLeft').onclick = () => routeSwipe(-SWIPE_DISTANCE, 0);

  // 信号注入
  el('btnShake').onclick = () => {
    injectWave((i) => {
      const m = 9.8 + Math.sin(i * 2.1) * (5 + (i % 5));
      const a = m / Math.sqrt(3);
      return { x: a, y: a, z: a };
    }, 900, '摇腕');
  };
  el('btnWalk').onclick = () => {
    injectWave((i) => {
      const m = 9.8 + Math.sin(i * 0.9) * 2.0;
      const a = m / Math.sqrt(3);
      return { x: a, y: a, z: a };
    }, 5000, '步行');
  };
  el('btnLift').onclick = () => {
    injectWave((i, sec) => ({ x: 0.4, y: 0.2, z: 9.8 - 0.7 * Math.min(sec, 4) }), 5000, '抬腕');
  };
  el('btnSensorFail').onclick = () => {
    mockSensor.failMode = !mockSensor.failMode;
    log('传感器故障注入 ' + (mockSensor.failMode ? '开启' : '关闭'));
    if (mockSensor.failMode) {
      sensorAdapter.stop();
      sensorAdapter.start(onSample, onSensorError);
    } else {
      onShow();
    }
  };
  el('btnRestart').onclick = () => {
    onHide();
    setTimeout(onShow, 400);
  };

  // 恢复主题
  store.on((what) => {
    if (what === 'settings' || what === 'load') {
      document.documentElement.style.setProperty('--accent', ACCENT_COLORS[store.getState().settings.accent] || ACCENT_COLORS.blue);
    }
  });

  onShow();
  syncHome();
  log('CyberDice 模拟器就绪');
}

main();

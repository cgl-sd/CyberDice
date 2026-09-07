const assert = require('assert');
const fs = require('fs');
const path = require('path');

const home = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'home', 'home.ux'), 'utf8');

test('Navigation contract: 手环应用首页仅右滑进入功能入口，左滑和上下滑不绑定应用功能', () => {
  assert.ok(home.includes("event.direction === 'right'"));
  assert.ok(!home.includes("event.direction === 'left'"));
  assert.ok(!home.includes("event.direction === 'up'"));
  assert.ok(!home.includes("event.direction === 'down'"));
});

test('Navigation contract: 摇动只引用预渲染残影，不引用旧模糊帧', () => {
  assert.ok(home.includes('shakeSrcOf'));
  assert.ok(!home.includes('die-blur.png'));
});

test('Navigation contract: 页面组件与页面模板不绘制应用内返回按钮', () => {
  const roots = [
    path.join(__dirname, '..', '..', 'src', 'common', 'components'),
    path.join(__dirname, '..', '..', 'src', 'pages'),
  ];
  roots.forEach((root) => {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    entries.forEach((entry) => {
      const file = entry.isDirectory() ? path.join(root, entry.name, entry.name + '.ux') : path.join(root, entry.name);
      if (file.endsWith('.ux') && fs.existsSync(file)) {
        assert.ok(!fs.readFileSync(file, 'utf8').includes('nav-back'), file + ' 不应有返回按钮');
      }
    });
  });
});

test('Simulator navigation contract: 控制面板按钮模拟上滑、右滑和左滑', () => {
  const sim = fs.readFileSync(path.join(__dirname, '..', 'sim', 'app.js'), 'utf8');
  assert.ok(sim.includes("device.addEventListener('pointercancel', cancelGesture)"));
  assert.ok(sim.includes("device.addEventListener('touchstart', beginGesture"));
  assert.ok(sim.includes("el('btnSwipeUp').onclick = () => routeSwipe(0, -SWIPE_DISTANCE)"));
  assert.ok(sim.includes("el('btnSwipeRight').onclick = () => routeSwipe(SWIPE_DISTANCE, 0)"));
  assert.ok(sim.includes("el('btnSwipeLeft').onclick = () => routeSwipe(-SWIPE_DISTANCE, 0)"));
  assert.ok(sim.includes("if (upward) navigate('history')"));
  assert.ok(!sim.includes("el('historyCard').onclick"));
});

test('About contract: 使用概念图骰子并完成中文本地化', () => {
  const about = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'about', 'about.ux'), 'utf8');
  const simHtml = fs.readFileSync(path.join(__dirname, '..', 'sim', 'index.html'), 'utf8');
  [about, simHtml].forEach((content) => {
    assert.ok(content.includes('ready-reference.png'));
    assert.ok(content.includes('摇一摇，随时掷骰'));
    assert.ok(!content.includes('Shake. Roll. Anywhere.'));
  });
  assert.ok(about.includes('版本 v{{ version }}'));
  assert.ok(simHtml.includes('版本 v1.1.0'));
});

test('Feature contract: 功能页可直接进入关于页', () => {
  const selectPage = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'dice-select', 'dice-select.ux'), 'utf8');
  const sim = fs.readFileSync(path.join(__dirname, '..', 'sim', 'app.js'), 'utf8');
  assert.ok(selectPage.includes('<page-header title="功能"></page-header>'));
  assert.ok(selectPage.includes('label="关于" chevron="true" onactivate="goAbout"'));
  assert.ok(selectPage.includes("router.push({ uri: '/pages/about' })"));
  assert.ok(sim.includes("about.onclick = () => navigate('about')"));
});

test('Simulator contract: 本地文件与 HTTP 打开时均使用相对资源和预打包逻辑', () => {
  const simHtml = fs.readFileSync(path.join(__dirname, '..', 'sim', 'index.html'), 'utf8');
  const sim = fs.readFileSync(path.join(__dirname, '..', 'sim', 'app.js'), 'utf8');
  assert.ok(simHtml.includes('src="common-bundle.js?v=1"'));
  assert.ok(!simHtml.includes('src="/src/common/images/'));
  assert.ok(sim.includes("const ASSET_ROOT = '../../src/common/images/';"));
  assert.ok(sim.includes('window.CyberDiceModules'));
});

test('Multi-device contract: 9、9 Pro、10、10 Pro 均有明确尺寸档与体验标识', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'manifest.json'), 'utf8'));
  const style = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'common', 'styles', 'style.css'), 'utf8');
  const simHtml = fs.readFileSync(path.join(__dirname, '..', 'sim', 'index.html'), 'utf8');
  const sim = fs.readFileSync(path.join(__dirname, '..', 'sim', 'app.js'), 'utf8');
  assert.strictEqual(manifest.config.designWidth, 336);
  assert.ok(style.includes('width: 100%;'));
  assert.ok(style.includes('@media screen and (shape: pill-shaped)'));
  assert.ok(simHtml.includes('id="deviceAutoProfile"'));
  assert.ok(!simHtml.includes('id="deviceProfile"'));
  assert.ok(sim.includes('function detectDeviceProfile(width, height)'));
  assert.ok(sim.includes("return 'band-9';"));
  assert.ok(sim.includes("return 'band-10';"));
  assert.ok(sim.includes("return 'band-9-pro';"));
  assert.ok(sim.includes("window.addEventListener('resize', syncDeviceProfile)"));
  assert.ok(sim.includes("'band-9': { name: '小米手环 9', size: '192×490'"));
  assert.ok(sim.includes("'band-10': { name: '小米手环 10', size: '212×520'"));
  assert.ok(sim.includes("'band-10-pro': { name: '小米手环 10 Pro', size: '336×480'"));
});

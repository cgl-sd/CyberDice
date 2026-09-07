const assert = require('assert');
const fs = require('fs');
const path = require('path');

const home = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'home', 'home.ux'), 'utf8');

test('Navigation contract: 手环应用首页上滑进入历史、右滑进入功能，左滑仍交给系统', () => {
  assert.ok(home.includes("event.direction === 'right'"));
  assert.ok(home.includes("event.direction === 'up'"));
  assert.ok(home.includes("router.push({ uri: '/pages/history' })"));
  assert.ok(!home.includes("event.direction === 'left'"));
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

test('Vela visual parity: 复用组件在自身作用域内声明浏览器版同款关键样式', () => {
  const components = path.join(__dirname, '..', '..', 'src', 'common', 'components');
  const diceStage = fs.readFileSync(path.join(components, 'dice-stage.ux'), 'utf8');
  const pageHeader = fs.readFileSync(path.join(components, 'page-header.ux'), 'utf8');
  const listRow = fs.readFileSync(path.join(components, 'list-row.ux'), 'utf8');
  assert.ok(diceStage.includes('<style>'));
  assert.ok(diceStage.includes('.die-img'));
  assert.ok(diceStage.includes('width: 148px;'));
  assert.ok(diceStage.includes('.result-num'));
  assert.ok(diceStage.includes('font-size: 110px;'));
  assert.ok(pageHeader.includes('.topbar'));
  assert.ok(pageHeader.includes('.nav-title'));
  assert.ok(listRow.includes('.list-item'));
  assert.ok(listRow.includes('.item-label'));
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

test('Feature contract: 功能页保留关于入口，历史记录仅由首页上滑进入', () => {
  const selectPage = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'dice-select', 'dice-select.ux'), 'utf8');
  const sim = fs.readFileSync(path.join(__dirname, '..', 'sim', 'app.js'), 'utf8');
  assert.ok(selectPage.includes('<text class="nav-title">功能</text>'));
  assert.ok(selectPage.includes('<text class="item-label">关于</text>'));
  assert.ok(selectPage.includes("router.push({ uri: '/pages/about' })"));
  assert.ok(!selectPage.includes('<text class="item-label">历史记录</text>'));
  assert.ok(!selectPage.includes('goHistory()'));
  assert.ok(sim.includes("about.onclick = () => navigate('about')"));
});

test('Vela visual parity: 功能与历史页面使用浏览器版同款页面内卡片和条件结构', () => {
  const selectPage = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'dice-select', 'dice-select.ux'), 'utf8');
  const history = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'history', 'history.ux'), 'utf8');
  ['偏好设置', '关于'].forEach((label) => {
    assert.ok(selectPage.includes('<text class="item-label">' + label + '</text>'));
  });
  assert.ok(!selectPage.includes('<text class="item-label">历史记录</text>'));
  assert.ok(!selectPage.includes('<list-row'));
  ['selectD6', 'select2D6', 'select3D6', 'selectD20'].forEach((handler) => {
    assert.ok(selectPage.includes('onclick="' + handler + '"'));
  });
  assert.ok(selectPage.includes("selectedLabel === '1D6'"));
  assert.ok(selectPage.includes("selectedLabel !== '1D6'"));
  assert.ok(history.includes('<block if="{{ items.length === 0 }}">'));
  assert.ok(history.includes('<block if="{{ items.length > 0 }}">'));
});

test('Vela runtime parity: 页面通过 $app.$def 访问应用单例，列表显式竖排', () => {
  const pages = ['home', 'dice-select', 'custom', 'history', 'settings', 'theme'];
  pages.forEach((name) => {
    const page = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', name, name + '.ux'), 'utf8');
    assert.ok(page.includes('this.$app.$def'), name + ' 必须从 Vela app 定义对象读取共享状态');
  });
  const style = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'common', 'styles', 'style.css'), 'utf8');
  assert.ok(/\.list\s*\{[\s\S]*?flex-direction:\s*column;/.test(style));
  assert.ok(/\.center-box\s*\{[\s\S]*?flex-direction:\s*column;/.test(style));
});

test('Vela visual parity: 首页骰子舞台与浏览器版一样直接由页面承载', () => {
  const style = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'common', 'styles', 'style.css'), 'utf8');
  assert.ok(home.includes('<div class="dice-area" onclick="onTapRoll">'));
  assert.ok(home.includes('src="{{ dieSrc }}"'));
  assert.ok(home.includes('src="/common/images/result-ticks.png"'));
  assert.ok(!home.includes('<dice-stage'));
  assert.ok(/\.list-item\s*\{[\s\S]*?height:\s*76px;/.test(style));
  assert.ok(/\.list\s*\{[\s\S]*?overflow:\s*scroll;/.test(style));
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

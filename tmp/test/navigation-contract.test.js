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
  const pages = path.join(__dirname, '..', '..', 'src', 'pages');
  fs.readdirSync(pages, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(pages, entry.name, entry.name + '.ux');
    if (entry.isDirectory() && fs.existsSync(file)) {
      assert.ok(!fs.readFileSync(file, 'utf8').includes('nav-back'), file + ' 不应有返回按钮');
    }
  });
});

test('About contract: 使用概念图骰子并完成中文本地化', () => {
  const about = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'about', 'about.ux'), 'utf8');
  assert.ok(about.includes('ready-reference.png'));
  assert.ok(about.includes('摇一摇，随时掷骰'));
  assert.ok(!about.includes('Shake. Roll. Anywhere.'));
  assert.ok(about.includes('版本 v{{ version }}'));
});

test('Feature contract: 功能页保留关于入口，历史记录仅由首页上滑进入', () => {
  const selectPage = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'dice-select', 'dice-select.ux'), 'utf8');
  assert.ok(selectPage.includes('<text class="nav-title">功能</text>'));
  assert.ok(selectPage.includes('<text class="item-label">关于</text>'));
  assert.ok(selectPage.includes("router.push({ uri: '/pages/about' })"));
  assert.ok(!selectPage.includes('<text class="item-label">历史记录</text>'));
  assert.ok(!selectPage.includes('goHistory()'));
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
  assert.ok(home.includes('<div class="home-dice-area" onclick="onTapRoll">'));
  assert.ok(home.includes('<block if="{{ jitter }}">'));
  assert.ok(home.includes('<block if="{{ !jitter }}">'));
  assert.ok(home.includes('src="{{ dieSrc }}"'));
  assert.ok(home.includes('src="/common/images/result-ticks.png"'));
  assert.ok(!home.includes('<dice-stage'));
  assert.ok(/\.home-die-img\s*\{[\s\S]*?width:\s*184px;/.test(home));
  assert.ok(/\.home-result-wrap\s*\{[\s\S]*?width:\s*276px;/.test(home));
  assert.ok(/\.home-function-card\s*\{[\s\S]*?margin:\s*10px 16px 16px 16px;/.test(home));
  assert.ok(/\.list-item\s*\{[\s\S]*?height:\s*80px;/.test(style));
  assert.ok(/\.list\s*\{[\s\S]*?overflow:\s*scroll;/.test(style));
});

test('Vela responsive contract: 小尺寸手环保留安全区、底部入口和紧凑历史卡片', () => {
  const style = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'common', 'styles', 'style.css'), 'utf8');
  const sharedCompact = style.slice(style.indexOf('@media (max-width: 160)'));
  const homeCompact = home.slice(home.indexOf('@media (max-width: 160)'));
  assert.ok(sharedCompact.includes('justify-content: center;'));
  assert.ok(/\.home-die-img,[\s\S]*?width:\s*164px;/.test(homeCompact));
  assert.ok(homeCompact.includes('margin: 8px 28px 32px 28px;'));
  assert.ok(/\.list-item\s*\{[\s\S]*?height:\s*76px;/.test(style));
  assert.ok(/\.history-item\s*\{[\s\S]*?height:\s*72px;/.test(style));
});

test('Vela theme contract: 每个主题色使用独立条件节点，不遗留蓝色选择态', () => {
  const theme = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'theme', 'theme.ux'), 'utf8');
  ['blue', 'green', 'purple'].forEach((accent) => {
    assert.ok(theme.includes("settings.accent === '" + accent + "'"));
    assert.ok(theme.includes("settings.accent !== '" + accent + "'"));
  });
  ['pickBlue', 'pickGreen', 'pickPurple'].forEach((handler) => {
    assert.ok(theme.includes('onclick="' + handler + '"'));
  });
  assert.ok(!theme.includes('for="{{ options }}"'));
  assert.ok(!theme.includes("'background-color:' + $item.color"));
});

test('Vela home layout: 首页功能卡使用本页静态 Flex 布局，不依赖 transform', () => {
  const style = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'common', 'styles', 'style.css'), 'utf8');
  assert.ok(/\.home-function-card\s*\{[\s\S]*?margin:\s*10px 16px 16px 16px;/.test(home));
  assert.ok(!home.includes('transform:'));
  assert.ok(!style.includes('.mode-card'));
  assert.ok(home.includes('@media (max-width: 160)'));
  assert.ok(home.includes('margin: 8px 28px 32px 28px;'));
});

test('Multi-device contract: 9、9 Pro、10、10 Pro 均有明确尺寸档与体验标识', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'manifest.json'), 'utf8'));
  const style = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'common', 'styles', 'style.css'), 'utf8');
  assert.strictEqual(manifest.config.designWidth, 336);
  assert.strictEqual(manifest.package, 'com.cyberdice');
  assert.ok(style.includes('width: 100%;'));
  assert.ok(style.includes('@media (max-width: 160)'));
});

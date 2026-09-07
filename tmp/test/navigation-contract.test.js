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

test('Simulator navigation contract: 两个首页按钮替代上滑/右滑，左滑仅模拟返回', () => {
  const sim = fs.readFileSync(path.join(__dirname, '..', 'sim', 'app.js'), 'utf8');
  assert.ok(sim.includes("device.addEventListener('pointercancel', cancelGesture)"));
  assert.ok(sim.includes("device.addEventListener('touchstart', beginGesture"));
  assert.ok(sim.includes("el('modeCard').onclick = () => navigate('dice-select')"));
  assert.ok(sim.includes("el('historyCard').onclick = () => navigate('history')"));
  assert.ok(sim.includes('BACK_SWIPE_DISTANCE'));
});

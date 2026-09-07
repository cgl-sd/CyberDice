/**
 * 将模拟器依赖的纯逻辑模块封装为可由 file:// 直接加载的普通脚本。
 * 这样浏览器不会因禁止 file:// fetch 而让模拟器初始化中断。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT = path.join(ROOT, 'tmp', 'sim', 'common-bundle.js');
const MODULES = [
  ['constants', 'src/common/scripts/constants.js'],
  ['dice', 'src/common/scripts/dice-engine.js'],
  ['shake-detector', 'src/common/scripts/shake-detector.js'],
  ['roll-controller', 'src/common/scripts/roll-controller.js'],
  ['sensor-adapter', 'src/common/scripts/sensor-adapter.js'],
  ['feedback', 'src/common/scripts/feedback-service.js'],
  ['storage-adapter', 'src/common/scripts/storage-adapter.js'],
  ['store', 'src/common/scripts/store.js'],
];

function wrap(name, relative, source) {
  const sourceName = path.basename(relative, '.js');
  return '  define(' + JSON.stringify(name) + ', ' + JSON.stringify(sourceName) + ', function (require, module, exports) {\n'
    + source + '\n'
    + '  });\n';
}

const output = [
  '/* 自动生成：node tmp/tools/build-sim-bundle.js。请勿手工编辑。 */',
  '(function (global) {',
  "  'use strict';",
  '  const modules = Object.create(null);',
  '  function define(name, sourceName, factory) {',
  '    const module = { exports: {} };',
  '    factory(function (specifier) {',
  "      const key = specifier.split('/').pop().replace(/\\.js$/, '');",
  '      return modules[key];',
  '    }, module, module.exports);',
  '    modules[name] = module.exports;',
  "    modules[sourceName] = module.exports;",
  '  }',
].concat(MODULES.map(([name, relative]) => wrap(name, relative, fs.readFileSync(path.join(ROOT, relative), 'utf8')))).concat([
  '  global.CyberDiceModules = modules;',
  '}(window));',
  '',
]).join('\n');

fs.writeFileSync(OUTPUT, output);
console.log('Generated ' + path.relative(ROOT, OUTPUT));

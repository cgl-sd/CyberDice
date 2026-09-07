/**
 * 极简测试运行器：node test/run.js
 * 收集各 test 文件中通过 global.test 注册的用例并顺序执行。
 */

const cases = [];
global.test = function (name, fn) {
  cases.push({ name: name, fn: fn });
};

require('./dice-engine.test.js');
require('./shake-detector.test.js');
require('./roll-controller.test.js');
require('./lifecycle.test.js');
require('./assets.test.js');
require('./navigation-contract.test.js');

let failed = 0;
for (const c of cases) {
  try {
    c.fn();
    console.log('  PASS  ' + c.name);
  } catch (e) {
    failed += 1;
    console.log('  FAIL  ' + c.name);
    console.log('        ' + (e && e.message ? e.message : String(e)));
  }
}

console.log('');
console.log(cases.length - failed + '/' + cases.length + ' passed');
process.exit(failed > 0 ? 1 : 0);

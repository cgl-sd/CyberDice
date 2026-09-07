const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DICE_DIR = path.join(__dirname, '..', '..', 'src', 'common', 'images', 'dice');

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.deepStrictEqual(Array.from(buf.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test('Assets: 静止骰子与四帧残影均为 2x 方形 PNG', () => {
  for (const name of ['die-1.png', 'die-2.png', 'die-3.png', 'die-4.png', 'die-5.png', 'die-6.png']) {
    assert.deepStrictEqual(pngSize(path.join(DICE_DIR, name)), [297, 297], name + ' 尺寸错误');
  }
  for (const name of ['ready-reference.png', 'shake-1.png', 'shake-2.png', 'shake-3.png', 'shake-4.png']) {
    assert.deepStrictEqual(pngSize(path.join(DICE_DIR, name)), [296, 296], name + ' 尺寸错误');
  }
});

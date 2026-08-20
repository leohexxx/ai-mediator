var test = require('node:test');
var assert = require('node:assert/strict');
var ocr = require('../services/ocr');
var mapLimit = ocr.mapLimit;
var sharp = require('sharp');

test('OCR worker pool preserves order and bounds concurrency', async function () {
  var active = 0;
  var peak = 0;
  var result = await mapLimit([1, 2, 3, 4, 5, 6], 3, async function (value) {
    active++;
    peak = Math.max(peak, active);
    await new Promise(function (resolve) { setTimeout(resolve, 5); });
    active--;
    return value * 2;
  });
  assert.deepEqual(result, [2, 4, 6, 8, 10, 12]);
  assert.equal(peak, 3);
});

test('长截图按重叠区域切片且图片哈希稳定', async function () {
  var image = await sharp({ create: { width: 800, height: 3900, channels: 3, background: '#ffffff' } })
    .png().toBuffer();
  var tiles = await ocr.splitLongImage(image);
  assert.equal(tiles.length, 3);
  assert.equal(tiles[0].top, 0);
  assert.equal(tiles[1].top, 1680);
  assert.equal(ocr.sha256(image), ocr.sha256(Buffer.from(image)));
  assert.equal(await ocr.differenceHash(image), await ocr.differenceHash(Buffer.from(image)));
});

test('OCR文字块按位置排序并删除切片重叠文本', function () {
  var merged = ocr.mergeBlocks([
    { text: '第二句', top: 200, left: 20 },
    { text: '第一句', top: 100, left: 20 },
    { text: '第二句', top: 260, left: 20 },
  ]);
  assert.deepEqual(merged.map(function (item) { return item.text; }), ['第一句', '第二句']);
  assert.equal(ocr.inferSpeaker(700, 1000), 'self');
  assert.equal(ocr.inferSpeaker(200, 1000), 'other');
  assert.equal(ocr.hammingDistance('0000000000000000', '0000000000000003'), 2);
});

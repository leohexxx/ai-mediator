var test = require('node:test');
var assert = require('node:assert/strict');
var mapLimit = require('../services/ocr').mapLimit;

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

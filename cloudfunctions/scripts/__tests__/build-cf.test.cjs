var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var os = require('os');
var path = require('path');
var build = require('../build-cf.cjs');

function createFunction(root, name) {
  var dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = {};');
  fs.writeFileSync(path.join(dir, 'package.json'), '{}');
}

test('自动发现全部有效云函数，忽略公共目录与非函数目录', function () {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-build-test-'));
  try {
    fs.mkdirSync(path.join(root, 'common'));
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.mkdirSync(path.join(root, 'notes'));
    createFunction(root, 'ocrImage');
    createFunction(root, 'analyzeCase');
    fs.mkdirSync(path.join(root, 'testConnect'));
    fs.writeFileSync(path.join(root, 'testConnect', 'index.js'), 'module.exports = {};');

    assert.deepEqual(build.discoverFunctionDirs(root), ['analyzeCase', 'ocrImage', 'testConnect']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

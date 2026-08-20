var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');

var cloudRoot = path.join(__dirname, '..', '..');

test('joinCase atomically reserves an unused invitation and compensates failures', function () {
  var source = fs.readFileSync(path.join(cloudRoot, 'joinCase', 'index.js'), 'utf8');
  assert.match(source, /where\(\{[\s\S]*used:\s*false/);
  assert.match(source, /usedBy:\s*openid/);
  assert.match(source, /used:\s*false,\s*usedBy:\s*null/);
});

test('createCase removes an orphan case when invitation creation fails', function () {
  var source = fs.readFileSync(path.join(cloudRoot, 'createCase', 'index.js'), 'utf8');
  assert.match(source, /doc\(caseResult\._id\)\.remove\(\)/);
});

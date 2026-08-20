var test = require('node:test');
var assert = require('node:assert/strict');
var migration = require('../scripts/migrate-v020');

test('migration only treats a CloudBase document with an _id as existing', function () {
  assert.equal(migration.documentExists({ data: {} }), false);
  assert.equal(migration.documentExists({ data: null }), false);
  assert.equal(migration.documentExists({ data: { _id: 'legacy-1' } }), true);
});

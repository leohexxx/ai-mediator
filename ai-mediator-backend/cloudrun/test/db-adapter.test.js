var test = require('node:test');
var assert = require('node:assert/strict');

process.env.LOCAL_MODE = 'true';
var fs = require('node:fs');
var path = require('node:path');
var testStoreDir = path.join(require('node:os').tmpdir(), 'ai-mediator-db-test-' + process.pid + '-' + Date.now());
process.env.LOCAL_STORE_DIR = testStoreDir;
var db = require('../services/db');

test('native single-document reads are normalized from arrays to object or null', function () {
  assert.deepEqual(db.normalizeDocumentResult({ data: [{ _id: 'one', value: 1 }] }).data, {
    _id: 'one', value: 1,
  });
  assert.equal(db.normalizeDocumentResult({ data: [] }).data, null);
  assert.deepEqual(db.normalizeDocumentResult({ data: { _id: 'already-normal' } }).data, {
    _id: 'already-normal',
  });
});

test.after(function () { fs.rmSync(testStoreDir, { recursive: true, force: true }); });

test('local adapter uses the same { data } write contract as CloudBase facade', async function () {
  var id = 'adapter-' + Date.now();
  await db.collection('adapter_test').doc(id).set({ data: { value: 1 } });
  await db.collection('adapter_test').doc(id).update({ data: { value: 2 } });
  var result = await db.collection('adapter_test').doc(id).get();
  assert.equal(result.data.value, 2);
  assert.equal(result.data.data, undefined);
  await db.collection('adapter_test').doc(id).remove();
});

test('local transaction rolls back writes when callback fails', async function () {
  var id = 'rollback-' + Date.now();
  await assert.rejects(db.runTransaction(async function (transaction) {
    await transaction.collection('adapter_test').doc(id).set({ data: { value: 'temporary' } });
    throw new Error('rollback');
  }));
  var result = await db.collection('adapter_test').doc(id).get();
  assert.equal(result.data, null);
});

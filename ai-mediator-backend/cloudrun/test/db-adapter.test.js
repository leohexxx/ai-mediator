var test = require('node:test');
var assert = require('node:assert/strict');

process.env.LOCAL_MODE = 'true';
var db = require('../services/db');

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

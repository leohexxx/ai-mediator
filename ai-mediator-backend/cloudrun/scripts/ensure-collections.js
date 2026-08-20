// 初始化 CloudBase 业务集合。
// 默认只检查/创建 OCR 异步任务集合；生产环境需要用服务端凭据执行。
var db = require('../services/db');

var COLLECTIONS = ['ocr_jobs'];

async function ensureCollection(name) {
  try {
    var result = await db.collection(name).where({}).limit(1).get();
    return { name: name, created: false, exists: true, count: (result.data || []).length };
  } catch (error) {
    var message = String(error && (error.message || error.errMsg || error) || '');
    if (message.indexOf('Db or Table not exist') === -1 && message.indexOf('ResourceNotFound') === -1) {
      throw error;
    }
    await db.createCollection(name);
    return { name: name, created: true, exists: true, count: 0 };
  }
}

async function main() {
  db.assertReady();
  var results = [];
  for (var i = 0; i < COLLECTIONS.length; i++) {
    results.push(await ensureCollection(COLLECTIONS[i]));
  }
  console.log(JSON.stringify({ event: 'collections_ready', results: results }));
  return results;
}

main().catch(function (error) {
  console.error(JSON.stringify({
    event: 'collections_init_failed',
    errorCode: error.code || 'COLLECTION_INIT_FAILED',
    message: error.message || String(error),
  }));
  process.exitCode = 1;
});

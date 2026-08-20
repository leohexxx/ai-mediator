var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');

var source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'upload.js'), 'utf8');
var errorHandler = require('../middleware/errorHandler');

test('缺失 ocr_jobs 集合时应转换为可行动的服务未初始化错误', function () {
  var error = new Error('DATABASE_COLLECTION_NOT_EXIST: [ResourceNotFound] Db or Table not exist: ocr_jobs');
  var normalized = errorHandler.normalizeError(error);
  assert.equal(errorHandler.isMissingCollectionError(error), true);
  assert.equal(normalized.status, 503);
  assert.equal(normalized.errorCode, 'OCR_COLLECTION_NOT_READY');
  assert.match(normalized.message, /识别服务尚未完成初始化/);
});

test('OCR 创建任务接口不应在同步请求中查询历史证据批次', function () {
  var start = source.indexOf("router.post('/ocr-jobs'");
  var end = source.indexOf("router.get('/ocr-jobs/:id'");
  assert.ok(start >= 0 && end > start, '应存在 OCR 异步任务路由');
  var routeSource = source.slice(start, end);
  assert.equal(routeSource.includes("collection('evidence_batches').where({ caseId: body.caseId })"), false);
  assert.ok(routeSource.includes('Promise.all([accessPromise, existingPromise])'), '案件权限和幂等查询应并行执行');
  assert.ok(routeSource.includes("status: 'queued'"), '创建任务时应快速写入 queued 状态');
  assert.ok(routeSource.includes('res.status(202)'), '创建任务应返回 202');
  assert.ok(routeSource.includes("event: 'ocr_job_queued'"), '创建任务应记录不含聊天内容的结构化事件');
  assert.ok(routeSource.includes('imageCount: fileIds.length'), '结构化事件应记录图片数量');
  assert.equal(routeSource.includes('fileIds: fileIds,\n      knownExactHashes'), true, '任务记录仍应保留文件 ID 供后台 Worker 读取');
});

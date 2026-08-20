var test = require('node:test');
var assert = require('node:assert/strict');

process.env.LOCAL_MODE = 'true';
var storage = require('../services/evidenceStorage');

var caseId = 'case-safe-123';
var validFileId = 'cloud://cloudbase-example/evidence/case-safe-123/123456_test.png';

test('只接受当前案件 evidence 目录中的 CloudBase fileID', function () {
  assert.equal(storage.isCaseEvidenceFileId(validFileId, caseId), true);
  assert.equal(storage.isCaseEvidenceFileId('cloud://cloudbase-example/evidence/other-case/123.png', caseId), false);
  assert.equal(storage.isCaseEvidenceFileId('cloud://cloudbase-example/private/123.png', caseId), false);
  assert.equal(storage.isCaseEvidenceFileId('https://example.com/evidence/case-safe-123/123.png', caseId), false);
});

test('服务端下载后才将图片转换为 OCR 所需的 Base64', async function () {
  var calls = [];
  var images = await storage.loadCaseEvidenceImages([validFileId], caseId, async function (fileId) {
    calls.push(fileId);
    return Buffer.from('sample-image-content');
  });
  assert.deepEqual(calls, [validFileId]);
  assert.equal(images.length, 1);
  assert.equal(images[0].index, 0);
  assert.equal(Buffer.from(images[0].base64, 'base64').toString(), 'sample-image-content');
});

test('不属于当前案件的 fileID 在下载前被拒绝', async function () {
  var called = false;
  await assert.rejects(
    storage.loadCaseEvidenceImages(['cloud://cloudbase-example/evidence/other-case/123.png'], caseId, async function () {
      called = true;
      return Buffer.from('should-not-be-read');
    }),
    function (error) { return error.code === 'INVALID_EVIDENCE_FILE'; }
  );
  assert.equal(called, false);
});

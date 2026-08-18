var express = require('express');
var router = express.Router();
var auth = require('../middleware/auth');
var parser = require('../utils/chatFormatter');
var workflow = require('../services/workflow').createWorkflow();

router.use(auth.requireAuth);

router.post('/batches', async function (req, res, next) {
  try {
    var body = req.body || {};
    if (!body.caseId) return res.status(400).json({ code: -1, errorCode: 'CASE_ID_REQUIRED', data: null, message: '缺少 caseId' });
    if (!body.rawText || !body.rawText.trim()) return res.status(400).json({ code: -1, errorCode: 'EVIDENCE_TEXT_REQUIRED', data: null, message: '证据内容为空' });
    var parsedMessages = body.parsedMessages && body.parsedMessages.length
      ? body.parsedMessages
      : parser.parseWeChatChatLog(body.rawText);
    if (!parsedMessages.length) return res.status(400).json({ code: -1, errorCode: 'EVIDENCE_PARSE_FAILED', data: null, message: '未解析到有效消息' });

    var result = await workflow.appendEvidence({
      caseId: body.caseId,
      openid: req.openid,
      rawText: body.rawText,
      parsedMessages: parsedMessages,
      fileIds: body.fileIds || [],
      sourceHashes: body.sourceHashes || [],
      perceptualHashes: body.perceptualHashes || [],
      ocrBlocks: body.ocrBlocks || [],
      note: body.note || '',
      idempotencyKey: body.idempotencyKey || '',
    });
    res.status(result.duplicate ? 200 : 201).json({
      code: 0,
      data: {
        batchId: result.batch._id,
        revision: result.batch.revision,
        party: result.batch.party,
        messageCount: result.batch.parsedMessages.length,
        duplicate: result.duplicate,
      },
      message: 'ok',
    });
  } catch (error) { next(error); }
});

module.exports = router;

// ═══════════════════════════════════════════════
// 健康检查路由
// ═══════════════════════════════════════════════
var express = require('express');
var router = express.Router();
var config = require('../config');

router.get('/', function (req, res) {
  res.json({
    code: 0, data: {
      status: 'ok',
      time: new Date().toISOString(),
      mode: config.localMode ? 'local' : 'cloudbase',
    },
    message: 'ok',
  });
});

module.exports = router;

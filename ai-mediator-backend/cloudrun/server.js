// ═══════════════════════════════════════════════
// Express 服务入口
// ═══════════════════════════════════════════════
var express = require('express');
var cors = require('cors');
var config = require('./config');
var errorHandler = require('./middleware/errorHandler');
var auth = require('./middleware/auth');
var healthRoute = require('./routes/health');
var analyzeRoute = require('./routes/analyze');
var uploadRoute = require('./routes/upload');
var chatRoute = require('./routes/chat');
var evidenceRoute = require('./routes/evidence');
var database = require('./services/db');
var analysisWorker = require('./services/analysisWorker').createWorker();
var ocrWorker = require('./services/ocrWorker').createWorker();
var metrics = require('./services/metrics');

database.assertReady();
var app = express();
app.locals.analysisWorker = analysisWorker;
app.locals.ocrWorker = ocrWorker;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/health', healthRoute);
app.use(auth.authMiddleware);
app.use('/api/analyze', analyzeRoute);
app.use('/api/upload', uploadRoute);
app.use('/api/chat', chatRoute);
app.use('/api/evidence', evidenceRoute);
app.use(errorHandler);

var server = app.listen(config.port, function () {
  console.log('✅ AI Mediator Backend running on port ' + config.port);
  console.log('   Mode: ' + (config.localMode ? 'LOCAL' : 'CLOUDBASE'));
  console.log('   LLM Keys: ' + config.llm.apiKeys.length + ' configured');
});

analysisWorker.start();
ocrWorker.start();
var metricsLogger = config.localMode ? null : metrics.startStructuredLogging(config.metrics.structuredLogIntervalMs);
server.on('close', function () {
  analysisWorker.stop();
  ocrWorker.stop();
  if (metricsLogger) metricsLogger.close();
});

module.exports = { app: app, server: server, analysisWorker: analysisWorker, ocrWorker: ocrWorker };

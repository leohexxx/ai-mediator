// ═══════════════════════════════════════════════
// Express 服务入口
// ═══════════════════════════════════════════════
var express = require('express');
var cors = require('cors');
var http = require('http');
var { WebSocketServer } = require('ws');
var config = require('./config');
var errorHandler = require('./middleware/errorHandler');
var healthRoute = require('./routes/health');
var analyzeRoute = require('./routes/analyze');
var uploadRoute = require('./routes/upload');
var chatRoute = require('./routes/chat');

var app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/health', healthRoute);
app.use('/api/analyze', analyzeRoute);
app.use('/api/upload', uploadRoute);
app.use('/api/chat', chatRoute);
app.use(errorHandler);

var server = http.createServer(app);
var wss = new WebSocketServer({ server: server, path: '/ws' });
var wsClients = {};

wss.on('connection', function (ws) {
  ws.subscribedIds = [];
  ws.on('message', function (data) {
    try {
      var msg = JSON.parse(data.toString());
      if (msg.type === 'subscribe' && msg.analysisId) {
        var id = msg.analysisId;
        if (!wsClients[id]) wsClients[id] = [];
        wsClients[id].push(ws);
        ws.subscribedIds.push(id);
        ws.send(JSON.stringify({ event: 'subscribed', data: { analysisId: id } }));
      }
    } catch (e) { /* ignore */ }
  });
  ws.on('close', function () {
    ws.subscribedIds.forEach(function (id) {
      if (wsClients[id]) {
        wsClients[id] = wsClients[id].filter(function (c) { return c !== ws; });
        if (wsClients[id].length === 0) delete wsClients[id];
      }
    });
  });
});

function pushProgress(analysisId, event, data) {
  (wsClients[analysisId] || []).forEach(function (ws) {
    try { ws.send(JSON.stringify({ event: event, data: data })); } catch (e) {}
  });
}

app.set('pushProgress', pushProgress);
app.set('wsClients', wsClients);

server.listen(config.port, function () {
  console.log('✅ AI Mediator Backend running on port ' + config.port);
  console.log('   Mode: ' + (config.localMode ? 'LOCAL' : 'CLOUDBASE'));
  console.log('   LLM Keys: ' + config.llm.apiKeys.length + ' configured');
});

module.exports = { app: app, server: server, pushProgress: pushProgress };

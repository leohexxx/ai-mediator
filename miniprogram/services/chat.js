var cloudRun = require('../utils/cloudrun');

function sendMessage(params) {
  return cloudRun.call('/api/chat/messages', 'POST', {
    caseId: params.caseId,
    analysisId: params.analysisId,
    message: params.message,
    jobId: params.jobId,
    threadId: params.threadId || ('case_' + params.caseId),
  });
}

function cancelMessage(jobId) {
  return cloudRun.call('/api/chat/' + encodeURIComponent(jobId) + '/cancel', 'POST', {});
}

function getHistory(caseId) {
  return cloudRun.call('/api/chat/case/' + encodeURIComponent(caseId) + '/messages', 'GET');
}

module.exports = { sendMessage: sendMessage, cancelMessage: cancelMessage, getHistory: getHistory };

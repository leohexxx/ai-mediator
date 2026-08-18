// 案例访问控制：所有 CloudRun 写入/读取都必须校验案例参与者身份。
var db = require('./db');

function isCaseParticipant(caseData, openid) {
  if (!caseData || !openid) return false;
  return [caseData.party_a, caseData.party_b].some(function (party) {
    return party && party.openid === openid;
  });
}

function createHttpError(status, message) {
  var error = new Error(message);
  error.status = status;
  return error;
}

async function getCaseForUser(caseId, openid) {
  if (!caseId) throw createHttpError(400, '缺少 caseId');

  var doc = await db.collection('cases').doc(caseId).get();
  if (!doc || !doc.data) throw createHttpError(404, '案例不存在');
  if (!isCaseParticipant(doc.data, openid)) throw createHttpError(403, '无权访问该案例');
  return doc.data;
}

async function getAnalysisForUser(analysisId, openid) {
  if (!analysisId) throw createHttpError(400, '缺少 analysisId');

  var doc = await db.collection('analyses').doc(analysisId).get();
  if (!doc || !doc.data) throw createHttpError(404, '分析不存在');
  await getCaseForUser(doc.data.caseId, openid);
  return doc.data;
}

function requireCaseAccess(req, res, next) {
  getCaseForUser(req.body && req.body.caseId, req.openid)
    .then(function (caseData) {
      req.caseData = caseData;
      next();
    })
    .catch(next);
}

module.exports = {
  isCaseParticipant: isCaseParticipant,
  getCaseForUser: getCaseForUser,
  getAnalysisForUser: getAnalysisForUser,
  requireCaseAccess: requireCaseAccess,
};

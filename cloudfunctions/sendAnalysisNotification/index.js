// 由私有 CloudRun 在分析提交完成后调用。只使用服务端查得的参与方，
// 不信任调用参数中的 openid 或报告文本。
var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
var db = cloud.database();

exports.main = async function (event) {
  try {
    if (!process.env.NOTIFICATION_INTERNAL_TOKEN || event.internalToken !== process.env.NOTIFICATION_INTERNAL_TOKEN) {
      return { code: -1, message: '无权调用通知服务' };
    }
    var analysisResult = await db.collection('analyses').doc(event.analysisId || '').get();
    var analysis = analysisResult.data;
    if (!analysis || analysis.status !== 'completed') return { code: -1, message: '分析尚未完成' };
    var caseResult = await db.collection('cases').doc(analysis.caseId).get();
    var caseData = caseResult.data;
    if (!caseData || caseData.analysisId !== analysis._id) return { code: -1, message: '分析已被新版本替代' };

    var verdict = analysis.coreConclusion && analysis.coreConclusion.oneLineVerdict || '分析已完成';
    if (verdict.length > 20) verdict = verdict.slice(0, 20) + '...';
    var recipients = [caseData.party_a, caseData.party_b].filter(function (party) { return party && party.openid; });
    var sent = 0;
    for (var i = 0; i < recipients.length; i++) {
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: recipients[i].openid,
          templateId: 'MotJahkp5DN6k66kLHps__sxR25G7yjDfUdCQ4jAj6M',
          page: 'pages/report/report?caseId=' + analysis.caseId,
          miniprogramState: ['developer', 'trial', 'formal'].indexOf(event.miniprogramState) !== -1 ? event.miniprogramState : 'developer',
          data: {
            phrase1: { value: '分析完成' },
            thing2: { value: (caseData.title || '调解案例').slice(0, 20) },
            thing3: { value: verdict },
          },
        });
        sent++;
      } catch (error) {
        console.warn('订阅消息发送失败:', error.message);
      }
    }
    return { code: 0, data: { sent: sent }, message: 'ok' };
  } catch (error) {
    console.error('sendAnalysisNotification error:', error);
    return { code: -1, message: error.message || '通知失败' };
  }
};

// 案件状态的唯一服务端定义。所有云函数通过 build-cf.cjs 同步本文件。
var STATUS = Object.freeze({
  WAITING_PARTY_B: 'waiting_party_b',
  WAITING_SUBMISSION: 'waiting_submission',
  SINGLE_SUBMITTED: 'single_submitted',
  ANALYZING: 'analyzing',
  SINGLE_COMPLETED: 'single_completed',
  COMPLETED: 'completed',
  DUAL_A_SUBMITTED: 'dual_a_submitted',
  DUAL_B_SUBMITTED: 'dual_b_submitted',
  EXPIRED: 'expired',
});

var TRANSITIONS = {};
TRANSITIONS[STATUS.WAITING_PARTY_B] = [STATUS.WAITING_SUBMISSION];
TRANSITIONS[STATUS.WAITING_SUBMISSION] = [STATUS.SINGLE_SUBMITTED, STATUS.ANALYZING];
TRANSITIONS[STATUS.SINGLE_SUBMITTED] = [STATUS.ANALYZING];
TRANSITIONS[STATUS.ANALYZING] = [
  STATUS.WAITING_SUBMISSION,
  STATUS.SINGLE_SUBMITTED,
  STATUS.SINGLE_COMPLETED,
  STATUS.COMPLETED,
  STATUS.DUAL_A_SUBMITTED,
  STATUS.DUAL_B_SUBMITTED,
];
TRANSITIONS[STATUS.SINGLE_COMPLETED] = [STATUS.SINGLE_SUBMITTED];
TRANSITIONS[STATUS.COMPLETED] = [STATUS.SINGLE_SUBMITTED];
TRANSITIONS[STATUS.DUAL_A_SUBMITTED] = [STATUS.ANALYZING];
TRANSITIONS[STATUS.DUAL_B_SUBMITTED] = [STATUS.SINGLE_SUBMITTED];
TRANSITIONS[STATUS.EXPIRED] = [];

function canTransition(from, to) {
  if (from === to) return true;
  return !!TRANSITIONS[from] && TRANSITIONS[from].indexOf(to) !== -1;
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error('非法案件状态迁移: ' + from + ' -> ' + to);
  }
  return to;
}

function isReportReady(status) {
  return [STATUS.SINGLE_COMPLETED, STATUS.COMPLETED, STATUS.DUAL_A_SUBMITTED, STATUS.DUAL_B_SUBMITTED]
    .indexOf(status) !== -1;
}

function isClosed(status) {
  return status === STATUS.EXPIRED || status === STATUS.SINGLE_COMPLETED ||
    status === STATUS.COMPLETED || status === STATUS.DUAL_B_SUBMITTED;
}

function finalAnalysisStatus(options) {
  if (options.isDebate) return STATUS.DUAL_B_SUBMITTED;
  if (options.analysisMode === 'single') {
    return options.caseMode === 'dual' ? STATUS.DUAL_A_SUBMITTED : STATUS.SINGLE_COMPLETED;
  }
  return STATUS.COMPLETED;
}

module.exports = {
  STATUS: STATUS,
  canTransition: canTransition,
  assertTransition: assertTransition,
  isReportReady: isReportReady,
  isClosed: isClosed,
  finalAnalysisStatus: finalAnalysisStatus,
};

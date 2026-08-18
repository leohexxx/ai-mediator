var test = require('node:test');
var assert = require('node:assert/strict');
var caseStatus = require('../../common/caseStatus');

test('case status exposes valid workflow transitions', function () {
  var S = caseStatus.STATUS;
  assert.equal(caseStatus.canTransition(S.WAITING_PARTY_B, S.WAITING_SUBMISSION), true);
  assert.equal(caseStatus.canTransition(S.DUAL_A_SUBMITTED, S.ANALYZING), true);
  assert.equal(caseStatus.canTransition(S.EXPIRED, S.ANALYZING), false);
  assert.throws(function () { caseStatus.assertTransition(S.COMPLETED, S.ANALYZING); });
});

test('case status derives final analysis states consistently', function () {
  var S = caseStatus.STATUS;
  assert.equal(caseStatus.finalAnalysisStatus({ analysisMode: 'single', caseMode: 'single' }), S.SINGLE_COMPLETED);
  assert.equal(caseStatus.finalAnalysisStatus({ analysisMode: 'single', caseMode: 'dual' }), S.DUAL_A_SUBMITTED);
  assert.equal(caseStatus.finalAnalysisStatus({ analysisMode: 'dual', caseMode: 'dual' }), S.COMPLETED);
  assert.equal(caseStatus.finalAnalysisStatus({ isDebate: true }), S.DUAL_B_SUBMITTED);
});

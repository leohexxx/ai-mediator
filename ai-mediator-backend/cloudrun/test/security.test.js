var test = require('node:test');
var assert = require('node:assert/strict');

process.env.LOCAL_MODE = 'false';
var auth = require('../middleware/auth');
var caseAccess = require('../services/caseAccess');

test('生产模式仅接受 CloudBase 网关注入的 openid', function () {
  assert.equal(auth.getOpenid({ headers: { 'x-wx-openid': 'wx-user' } }), 'wx-user');
  assert.equal(auth.getOpenid({ headers: { 'x-cloudbase-openid': 'cloud-user' } }), 'cloud-user');
  assert.equal(auth.getOpenid({ headers: { 'x-openid': 'spoofed-user' } }), null);
  assert.equal(auth.getOpenid({ headers: { 'x-mock-openid': 'mock-user' } }), null);
});

test('只有案例双方可以访问案例', function () {
  var caseData = {
    party_a: { openid: 'party-a' },
    party_b: { openid: 'party-b' },
  };

  assert.equal(caseAccess.isCaseParticipant(caseData, 'party-a'), true);
  assert.equal(caseAccess.isCaseParticipant(caseData, 'party-b'), true);
  assert.equal(caseAccess.isCaseParticipant(caseData, 'other-user'), false);
  assert.equal(caseAccess.isCaseParticipant(caseData, ''), false);
});

// ═══════════════════════════════════════════════
// getCaseList 云函数
// 职责: 用户案例列表（按 openid 查询 + 分页）
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();
var _ = db.command;

/**
 * 云函数入口
 * @param {Object} event
 * @param {number} [event.pageSize=10] - 每页条数
 * @param {number} [event.page=1] - 页码（从1开始）
 * @param {Object} context
 */
exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  try {
    var pageSize = event.pageSize || 10;
    var page = event.page || 1;
    var skip = (page - 1) * pageSize;

    // 查询用户作为甲方或乙方的案例
    var result = await db.collection('cases')
      .where(_.or([
        { 'party_a.openid': openid },
        { 'party_b.openid': openid },
      ]))
      .orderBy('updatedAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();

    // 获取总数
    var countResult = await db.collection('cases')
      .where(_.or([
        { 'party_a.openid': openid },
        { 'party_b.openid': openid },
      ]))
      .count();

    // 为每条案例附加角色信息
    var list = result.data.map(function (item) {
      var role = item.party_a.openid === openid ? 'party_a' : 'party_b';
      return {
        _id: item._id,
        title: item.title,
        relationship: item.relationship,
        privacy: item.privacy,
        role: role,
        party_a: {
          nickname: item.party_a.nickname,
          submitted: item.party_a.submitted,
        },
        party_b: {
          nickname: item.party_b.nickname,
          openid: item.party_b.openid,
          submitted: item.party_b.submitted,
        },
        status: item.status,
        analysisId: item.analysisId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    return {
      code: 0,
      data: {
        list: list,
        total: countResult.total,
        page: page,
        pageSize: pageSize,
        hasMore: skip + pageSize < countResult.total,
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('getCaseList error:', error);
    return { code: -1, data: null, message: error.message || '获取案例列表失败' };
  }
};

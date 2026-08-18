// v0.2.0 one-time migration. Dry-run is the default; writes require both
// --apply and MIGRATION_CONFIRM=v0.2.0.
var db = require('../services/db');
var workflow = require('../services/workflow');

async function fetchAll(collectionName) {
  var result = [];
  var offset = 0;
  var pageSize = 100;
  while (true) {
    var page = await db.collection(collectionName).where({}).skip(offset).limit(pageSize).get();
    var rows = page.data || [];
    result = result.concat(rows);
    if (rows.length < pageSize) return result;
    offset += rows.length;
  }
}

function migratedStatus(caseData, hasEvidence) {
  if (caseData.status === 'analyzing' || caseData.status === 'cancel_requested') return caseData.status;
  if (['completed', 'single_completed', 'dual_a_submitted', 'dual_b_submitted', 'expired'].indexOf(caseData.status) !== -1) {
    return caseData.status;
  }
  if (caseData.party_b && caseData.party_b.openid) return 'dual_collecting';
  return hasEvidence ? 'single_submitted' : caseData.status;
}

// The database adapter normalizes a missing document to `{ data: null }`.
// Require a projected `_id` so an empty SDK response is never mistaken for an
// already-migrated legacy batch.
function documentExists(result) {
  return !!(result && result.data && result.data._id);
}

async function run(apply) {
  db.assertReady();
  var evidence = await fetchAll('evidence');
  var cases = await fetchAll('cases');
  var byCase = {};
  evidence.forEach(function (item) {
    if (!byCase[item.caseId]) byCase[item.caseId] = [];
    byCase[item.caseId].push(item);
  });

  var batchWrites = 0;
  for (var i = 0; i < evidence.length; i++) {
    var legacy = evidence[i];
    var batchId = 'legacy_' + legacy._id;
    var existing = await db.collection('evidence_batches').doc(batchId).get();
    if (documentExists(existing)) continue;
    batchWrites++;
    if (apply) {
      await db.collection('evidence_batches').doc(batchId).set({ data: {
        caseId: legacy.caseId,
        party: legacy.party,
        revision: 1,
        rawText: legacy.rawText || '',
        analysisInputSummary: workflow.buildEvidenceSummary(legacy.rawText || ''),
        parsedMessages: legacy.parsedMessages || [],
        fileIds: legacy.fileIds || [],
        sourceHashes: legacy.sourceHashes || [],
        perceptualHashes: legacy.perceptualHashes || [],
        ocrBlocks: legacy.ocrBlocks || [],
        note: legacy.note || '',
        status: 'ready',
        legacyEvidenceId: legacy._id,
        createdBy: legacy.openid || '',
        createdAt: legacy.createdAt || legacy.updatedAt || new Date().toISOString(),
        updatedAt: legacy.updatedAt || legacy.createdAt || new Date().toISOString(),
      } });
    }
  }

  for (var j = 0; j < cases.length; j++) {
    var caseData = cases[j];
    var hasEvidence = !!(byCase[caseData._id] && byCase[caseData._id].length);
    var active = caseData.status === 'analyzing' || caseData.status === 'cancel_requested';
    if (apply) {
      await db.collection('cases').doc(caseData._id).update({ data: {
        status: migratedStatus(caseData, hasEvidence),
        evidenceRevision: Number(caseData.evidenceRevision) || (hasEvidence ? 1 : 0),
        lockedEvidenceRevision: active ? (Number(caseData.lockedEvidenceRevision) || 1) : null,
        activeAnalysisId: active ? (caseData.activeAnalysisId || caseData.analysisId || null) : null,
        analysisLock: active,
        analysisStartedBy: caseData.analysisStartedBy || null,
        analysisStartedAt: caseData.analysisStartedAt || null,
        cancelRequestedBy: caseData.cancelRequestedBy || null,
        cancelRequestedAt: caseData.cancelRequestedAt || null,
        schemaVersion: 'v0.2.0',
        migratedAt: new Date().toISOString(),
      } });
    }
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', cases: cases.length, legacyEvidence: evidence.length, newBatches: batchWrites }, null, 2));
}

var apply = process.argv.indexOf('--apply') !== -1;
if (apply && process.env.MIGRATION_CONFIRM !== 'v0.2.0') {
  console.error('Refusing to write: set MIGRATION_CONFIRM=v0.2.0 together with --apply');
  process.exit(2);
}
if (require.main === module) {
  run(apply).catch(function (error) { console.error(error); process.exit(1); });
}

module.exports = { documentExists: documentExists, migratedStatus: migratedStatus, run: run };

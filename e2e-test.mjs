// E2E Integration Test: Full analysis flow with v2 schema validation
// Run with: node e2e-test.mjs

const BASE = 'http://localhost:3001/api';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForServer(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('Server did not start in time');
}

// Validate v2 schema structure
function validateV2Schema(analysis, errors) {
  const prefix = '  ';

  // Top-level fields
  const requiredTop = ['id', 'caseId', 'createdAt', 'schemaVersion',
    'coreConclusion', 'evidenceWeights', 'emotionCurve',
    'mediationStrategy', 'detailedAnalysis', 'advice'];

  for (const f of requiredTop) {
    if (!(f in analysis)) {
      errors.push(`${prefix}MISSING top-level field: ${f}`);
    }
  }

  // schemaVersion must be 'v2'
  if (analysis.schemaVersion !== 'v2') {
    errors.push(`${prefix}schemaVersion expected 'v2', got '${analysis.schemaVersion}'`);
  }

  // coreConclusion
  const cc = analysis.coreConclusion;
  if (cc) {
    const ccFields = ['overallWinner', 'scoreA', 'scoreB', 'oneLineVerdict',
      'keyReasons', 'recommendedAction', 'confidence', 'confidenceReasons'];
    for (const f of ccFields) {
      if (!(f in cc)) errors.push(`${prefix}MISSING coreConclusion.${f}`);
    }
    if (cc.overallWinner && !['a', 'b', 'tie'].includes(cc.overallWinner)) {
      errors.push(`${prefix}coreConclusion.overallWinner invalid: ${cc.overallWinner}`);
    }
    if (typeof cc.confidence !== 'number' || cc.confidence < 0 || cc.confidence > 100) {
      errors.push(`${prefix}coreConclusion.confidence out of range: ${cc.confidence}`);
    }
  }

  // evidenceWeights
  const ew = analysis.evidenceWeights;
  if (Array.isArray(ew)) {
    ew.forEach((e, i) => {
      const ewFields = ['id', 'speaker', 'content', 'timestamp', 'weight', 'weightReason', 'favors'];
      for (const f of ewFields) {
        if (!(f in e)) errors.push(`${prefix}MISSING evidenceWeights[${i}].${f}`);
      }
      if (e.favors && !['a', 'b', 'neutral'].includes(e.favors)) {
        errors.push(`${prefix}evidenceWeights[${i}].favors invalid: ${e.favors}`);
      }
    });
  } else {
    errors.push(`${prefix}evidenceWeights is not an array`);
  }

  // emotionCurve
  const ec = analysis.emotionCurve;
  if (Array.isArray(ec)) {
    ec.forEach((c, i) => {
      if (!('speaker' in c)) errors.push(`${prefix}MISSING emotionCurve[${i}].speaker`);
      if (!Array.isArray(c.points)) errors.push(`${prefix}emotionCurve[${i}].points not array`);
    });
  } else {
    errors.push(`${prefix}emotionCurve is not an array`);
  }

  // mediationStrategy
  const ms = analysis.mediationStrategy;
  if (Array.isArray(ms)) {
    ms.forEach((s, i) => {
      const msFields = ['step', 'title', 'description', 'target', 'expectedOutcome', 'difficulty'];
      for (const f of msFields) {
        if (!(f in s)) errors.push(`${prefix}MISSING mediationStrategy[${i}].${f}`);
      }
      if (s.target && !['a', 'b', 'both'].includes(s.target)) {
        errors.push(`${prefix}mediationStrategy[${i}].target invalid: ${s.target}`);
      }
      if (s.difficulty && !['easy', 'medium', 'hard'].includes(s.difficulty)) {
        errors.push(`${prefix}mediationStrategy[${i}].difficulty invalid: ${s.difficulty}`);
      }
    });
  } else {
    errors.push(`${prefix}mediationStrategy is not an array`);
  }

  // detailedAnalysis
  const da = analysis.detailedAnalysis;
  if (da) {
    const daFields = ['summary', 'relationship', 'characters', 'conflicts', 'timeline'];
    for (const f of daFields) {
      if (!(f in da)) errors.push(`${prefix}MISSING detailedAnalysis.${f}`);
    }
    // V2 Character should have communicationStyle
    if (Array.isArray(da.characters)) {
      da.characters.forEach((c, i) => {
        if (!('communicationStyle' in c)) {
          errors.push(`${prefix}MISSING detailedAnalysis.characters[${i}].communicationStyle (v2 field)`);
        }
      });
    }
    // V2 Conflict should have severity
    if (Array.isArray(da.conflicts)) {
      da.conflicts.forEach((c, i) => {
        if (!('severity' in c)) {
          errors.push(`${prefix}MISSING detailedAnalysis.conflicts[${i}].severity (v2 field)`);
        }
      });
    }
    // V2 TimelineEvent should have isTurningPoint
    if (Array.isArray(da.timeline)) {
      da.timeline.forEach((t, i) => {
        if (!('isTurningPoint' in t)) {
          errors.push(`${prefix}MISSING detailedAnalysis.timeline[${i}].isTurningPoint (v2 field)`);
        }
      });
    }
  }

  // advice
  if (analysis.advice) {
    const advFields = ['toA', 'toB', 'toBoth'];
    for (const f of advFields) {
      if (!(f in analysis.advice)) errors.push(`${prefix}MISSING advice.${f}`);
    }
  }
}

async function main() {
  const errors = [];
  const steps = [];

  console.log('=== E2E Integration Test: AI Mediator v2 Analysis ===\n');

  // Step 0: Wait for server
  console.log('[0] Waiting for server...');
  await waitForServer();
  console.log('  Server is up.\n');

  // Step 1: Create a case
  console.log('[1] Creating case...');
  const caseId = `e2e_${Date.now()}`;
  const createRes = await fetch(`${BASE}/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: caseId,
      title: 'E2E Test: 小明 vs 小红',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parties: [],
      evidence: [],
      rawText: '',
      analysis: null,
      chatHistory: [],
    }),
  });
  const created = await createRes.json();
  if (createRes.status !== 201) {
    errors.push(`Create case failed: ${createRes.status}`);
    console.log('  FAIL');
  } else {
    console.log(`  Created case: ${created.id}`);
  }
  steps.push({ name: 'Create case', pass: createRes.status === 201 });

  // Step 2: PATCH parties + relationship
  console.log('\n[2] PATCH parties + relationship...');
  const patchRes = await fetch(`${BASE}/cases/${caseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parties: [
        { name: '小明', role: 'party_a' },
        { name: '小红', role: 'party_b' },
      ],
      relationship: '情侣',
    }),
  });
  const patched = await patchRes.json();
  if (patchRes.status !== 200) {
    errors.push(`PATCH case failed: ${patchRes.status}`);
    console.log('  FAIL');
  } else {
    console.log(`  Parties: ${patched.parties?.map(p => p.name).join(', ')}, relationship: ${patched.relationship}`);
  }
  steps.push({ name: 'PATCH parties+relationship', pass: patchRes.status === 200 && patched.parties?.length === 2 });

  // Step 3: Add text evidence
  console.log('\n[3] Adding text evidence...');
  const chatLog = `小明 10:30: 你怎么又不接我电话？我都打了五个了！
小红 10:31: 我在开会啊，你能不能不要这么敏感？
小明 10:32: 敏感？你上周也是这样，每次都拿开会当借口。你到底有没有把我放在心上？
小红 10:33: 你这样无理取闹真的让我很累。我已经解释过了，你为什么就是不信我？
小明 10:35: 因为你以前骗过我！上次你说加班，结果是跟同事去喝酒了。
小红 10:36: 那是很久以前的事了，我已经道过歉了。你总是翻旧账，这样下去没法过了。
小明 10:38: 好，那你说怎么办？你是不是想分手？
小红 10:39: 我没说要分手，但你需要改改你这种控制欲。我也有自己的生活。
小明 10:40: 我只是想关心你，怎么就变成控制欲了？
小红 10:41: 关心不是每五分钟打一个电话。你这样让我窒息。`;

  const evRes = await fetch(`${BASE}/cases/${caseId}/evidence/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: chatLog,
      source: 'party_a',
    }),
  });
  const evData = await evRes.json();
  if (evRes.status !== 200) {
    errors.push(`Add evidence failed: ${evRes.status}`);
    console.log('  FAIL');
  } else {
    console.log(`  Evidence added: ${evData.evidenceId} (${chatLog.length} chars)`);
  }
  steps.push({ name: 'Add text evidence', pass: evRes.status === 200 });

  // Step 4: Trigger analysis (SSE)
  console.log('\n[4] Triggering analysis (SSE stream)...');
  const analyzeRes = await fetch(`${BASE}/cases/${caseId}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!analyzeRes.ok) {
    const errText = await analyzeRes.text();
    errors.push(`Analyze failed: ${analyzeRes.status} - ${errText}`);
    console.log(`  FAIL: ${analyzeRes.status} - ${errText}`);
    steps.push({ name: 'Analyze endpoint', pass: false });
  } else {
    // Read SSE stream
    const reader = analyzeRes.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let progressSteps = [];
    let analysisResult = null;
    let hasError = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;

      // Parse SSE lines
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'progress') {
            progressSteps.push(`${parsed.step}(${parsed.progress}%)`);
            process.stdout.write(`  Progress: ${parsed.step} - ${parsed.message} (${parsed.progress}%)\r`);
          } else if (parsed.type === 'result') {
            analysisResult = parsed.analysis;
            console.log(`\n  Result received! schemaVersion=${analysisResult?.schemaVersion}`);
          } else if (parsed.type === 'error' || parsed.error) {
            hasError = true;
            errors.push(`SSE error: ${parsed.message || parsed.error}`);
            console.log(`\n  ERROR: ${parsed.message || parsed.error}`);
          }
        } catch {}
      }
    }

    console.log(`\n  Progress steps: ${progressSteps.join(' → ')}`);

    if (hasError || !analysisResult) {
      steps.push({ name: 'Analyze endpoint', pass: false });
      errors.push('No analysis result received');
    } else {
      steps.push({ name: 'Analyze endpoint', pass: true });

      // Step 5: Validate v2 schema
      console.log('\n[5] Validating v2 schema...');
      validateV2Schema(analysisResult, errors);

      if (errors.length === 0) {
        console.log('  ✅ All v2 schema fields present and valid!');
        console.log(`  - coreConclusion: winner=${analysisResult.coreConclusion.overallWinner}, ` +
          `scoreA=${analysisResult.coreConclusion.scoreA}, scoreB=${analysisResult.coreConclusion.scoreB}, ` +
          `confidence=${analysisResult.coreConclusion.confidence}`);
        console.log(`  - evidenceWeights: ${analysisResult.evidenceWeights?.length} items`);
        console.log(`  - emotionCurve: ${analysisResult.emotionCurve?.length} speakers`);
        console.log(`  - mediationStrategy: ${analysisResult.mediationStrategy?.length} steps`);
        console.log(`  - detailedAnalysis: ${analysisResult.detailedAnalysis?.characters?.length} chars, ` +
          `${analysisResult.detailedAnalysis?.conflicts?.length} conflicts, ` +
          `${analysisResult.detailedAnalysis?.timeline?.length} timeline events`);
        console.log(`  - advice: toA=${analysisResult.advice?.toA?.length}, ` +
          `toB=${analysisResult.advice?.toB?.length}, toBoth=${analysisResult.advice?.toBoth?.length}`);
      } else {
        console.log(`  ❌ ${errors.length} schema validation errors:`);
        errors.forEach(e => console.log(e));
      }
      steps.push({ name: 'V2 schema validation', pass: errors.length === 0 });
    }
  }

  // Step 6: Verify case was updated (GET case)
  console.log('\n[6] Verifying case was updated with analysis...');
  const getRes = await fetch(`${BASE}/cases/${caseId}`);
  const caseData = await getRes.json();
  if (caseData.analysis && caseData.analysis.schemaVersion === 'v2') {
    console.log('  ✅ Case analysis stored with schemaVersion=v2');
    steps.push({ name: 'Case persisted analysis', pass: true });
  } else {
    errors.push('Case analysis not stored or schemaVersion != v2');
    console.log('  ❌ Case analysis not properly stored');
    steps.push({ name: 'Case persisted analysis', pass: false });
  }

  // Cleanup: delete case
  await fetch(`${BASE}/cases/${caseId}`, { method: 'DELETE' });

  // Summary
  console.log('\n=== E2E Test Summary ===');
  const passed = steps.filter(s => s.pass).length;
  const failed = steps.filter(s => !s.pass).length;
  steps.forEach(s => {
    console.log(`  ${s.pass ? '✅' : '❌'} ${s.name}`);
  });
  console.log(`\nTotal: ${steps.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(e));
    process.exit(1);
  } else {
    console.log('\n✅ E2E test PASSED — all steps successful!');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('E2E test crashed:', err);
  process.exit(2);
});

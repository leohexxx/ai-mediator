import type { Case, Analysis, ChatMessage, AnalysisProgress } from '../types';

const BASE = '/api';

function generateId(): string {
  return `case_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createCase(title: string): Promise<Case> {
  const newCase: Case = {
    id: generateId(),
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parties: [],
    evidence: [],
    rawText: '',
    analysis: null,
    chatHistory: [],
  };

  const res = await fetch(`${BASE}/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newCase),
  });
  if (!res.ok) throw new Error('Failed to create case');
  return res.json();
}

export async function updateCaseServer(
  caseId: string,
  updates: Partial<Case>
): Promise<Case> {
  const res = await fetch(`${BASE}/cases/${caseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update case on server');
  return res.json();
}

export async function uploadEvidence(
  caseId: string,
  file: File,
  source: 'party_a' | 'party_b' | 'self'
): Promise<{ extractedText: string; evidenceId: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('source', source);

  const res = await fetch(`${BASE}/cases/${caseId}/evidence`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload evidence');
  return res.json();
}

export async function addTextEvidence(
  caseId: string,
  text: string,
  source: 'party_a' | 'party_b' | 'self'
): Promise<{ extractedText: string; evidenceId: string }> {
  const res = await fetch(`${BASE}/cases/${caseId}/evidence/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, source }),
  });
  if (!res.ok) throw new Error('Failed to add text evidence');
  return res.json();
}

export async function triggerAnalysis(
  caseId: string,
  onProgress: (p: AnalysisProgress) => void
): Promise<Analysis> {
  const res = await fetch(`${BASE}/cases/${caseId}/analyze`, {
    method: 'POST',
  });

  if (!res.ok) {
    let errMsg = 'Analysis failed';
    try {
      const errBody = await res.json();
      if (errBody.error) errMsg = errBody.error;
    } catch {}
    throw new Error(errMsg);
  }
  if (!res.body) throw new Error('Analysis failed: no response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let result: Analysis | null = null;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'progress') {
          if (parsed.step === 'error') {
            throw new Error(parsed.message || 'Analysis failed');
          }
          onProgress(parsed as AnalysisProgress);
        } else if (parsed.type === 'result') {
          result = parsed.analysis;
        }
      } catch (e) {
        // Re-throw if it's our error from the error-check above
        if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
        // Skip malformed chunks
      }
    }
  }

  if (!result) throw new Error('No analysis result received');
  return result;
}

export async function sendMessage(
  caseId: string,
  content: string,
  onChunk: (chunk: string) => void
): Promise<ChatMessage> {
  const res = await fetch(`${BASE}/cases/${caseId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  if (!res.ok || !res.body) throw new Error('Chat failed');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        if (typeof parsed === 'string') {
          fullContent += parsed;
          onChunk(parsed);
        } else if (parsed && typeof parsed === 'object' && parsed.error) {
          throw new Error(parsed.error);
        }
      } catch (e) {
        // Re-throw if it's our error from the error-check above
        if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
        // Skip unparseable chunks
      }
    }
  }

  return {
    id: `msg_${Date.now()}`,
    role: 'assistant',
    content: fullContent,
    timestamp: new Date().toISOString(),
  };
}

export async function getCases(): Promise<Case[]> {
  const res = await fetch(`${BASE}/cases`);
  if (!res.ok) throw new Error('Failed to fetch cases');
  return res.json();
}

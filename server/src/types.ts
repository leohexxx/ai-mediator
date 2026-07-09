export interface Evidence {
  id: string;
  type: 'screenshot' | 'screen_recording' | 'text';
  source: 'party_a' | 'party_b' | 'self';
  fileName: string;
  extractedText: string;
  uploadedAt: string;
}

export interface Character {
  name: string;
  role: 'party_a' | 'party_b' | 'other';
  personality: string;
  stance: string;
  emotionalState: string;
}

export interface TimelineEvent {
  timestamp: string;
  speaker: string;
  content: string;
  emotion: string;
  significance: string;
}

export interface Conflict {
  topic: string;
  partyAStance: string;
  partyBStance: string;
  aiJudgment: string;
  winner: 'a' | 'b' | 'tie';
}

export interface Verdict {
  summary: string;
  scoreA: number;
  scoreB: number;
  reasoning: string[];
  overallWinner: 'a' | 'b' | 'tie';
}

export interface Advice {
  toA: string[];
  toB: string[];
  toBoth: string[];
}

export interface Analysis {
  id: string;
  caseId: string;
  summary: string;
  characters: Character[];
  relationship: string;
  timeline: TimelineEvent[];
  conflicts: Conflict[];
  verdict: Verdict;
  advice: Advice;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Case {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  parties: { name: string; role: string }[];
  evidence: Evidence[];
  rawText: string;
  analysis: Analysis | null;
  chatHistory: ChatMessage[];
}

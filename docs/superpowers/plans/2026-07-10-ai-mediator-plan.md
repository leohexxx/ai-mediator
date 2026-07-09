# AI 调解员 — MVP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 AI 调解员 MVP — 用户上传微信聊天截图，AI 分析人物关系、判断对错、给出建议，并支持交互式追问。

**Architecture:** React + TypeScript + Vite 前端，Node.js + Express 后端，客户端 Tesseract.js OCR，Claude API 做语义分析。MVP 纯 Web，手机浏览器直接使用。

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Express, Tesseract.js, Claude API / OpenAI API, IndexedDB

---

## 文件结构

```
app/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.js
├── postcss.config.js
├── .gitignore
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── vite-env.d.ts
│   ├── types/index.ts
│   ├── utils/ocr.ts
│   ├── utils/storage.ts
│   ├── services/api.ts
│   ├── hooks/useCase.ts
│   ├── hooks/useAnalysis.ts
│   ├── components/Layout.tsx
│   ├── components/Header.tsx
│   ├── components/UploadZone.tsx
│   ├── components/CaseCard.tsx
│   ├── components/PartyForm.tsx
│   ├── components/AnalysisProgress.tsx
│   ├── components/ReportSummary.tsx
│   ├── components/CharacterMap.tsx
│   ├── components/Timeline.tsx
│   ├── components/VerdictCard.tsx
│   ├── components/AdviceCard.tsx
│   ├── components/ChatPanel.tsx
│   ├── components/EvidenceUpload.tsx
│   ├── pages/HomePage.tsx
│   ├── pages/UploadPage.tsx
│   ├── pages/AnalysisPage.tsx
│   └── pages/ReportPage.tsx
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── routes/cases.ts
│       ├── routes/ocr.ts
│       ├── services/llm.ts
│       ├── services/parser.ts
│       └── types.ts
```

---

### Task 1: 前端项目脚手架

**Files:**
- Create: `app/package.json`
- Create: `app/index.html`
- Create: `app/vite.config.ts`
- Create: `app/tsconfig.json`
- Create: `app/tsconfig.node.json`
- Create: `app/tailwind.config.js`
- Create: `app/postcss.config.js`
- Create: `app/.gitignore`
- Create: `app/src/main.tsx`
- Create: `app/src/App.tsx`
- Create: `app/src/index.css`
- Create: `app/src/vite-env.d.ts`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "ai-mediator",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.23.1",
    "tesseract.js": "^5.1.1",
    "idb": "^8.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.5",
    "vite": "^5.3.1"
  }
}
```

- [ ] **Step 2: 创建 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#1a1a2e" />
    <meta name="description" content="AI 调解员 — 你的智能情感仲裁助手" />
    <title>AI 调解员</title>
  </head>
  <body class="bg-gray-950 text-white">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: 创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 4: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: 创建 tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: 创建 tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 7: 创建 postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 8: 创建 .gitignore**

```
node_modules
dist
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 9: 创建 src/vite-env.d.ts**

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 10: 创建 src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-gray-950 text-gray-100 antialiased;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
      'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  }
}

@layer components {
  .btn-primary {
    @apply bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 px-6 rounded-xl
      transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed;
  }
  .btn-secondary {
    @apply bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium py-3 px-6 rounded-xl
      border border-gray-700 transition-all duration-200 active:scale-95;
  }
  .card {
    @apply bg-gray-900 border border-gray-800 rounded-2xl p-6;
  }
  .input-field {
    @apply w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-gray-100
      placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent;
  }
}
```

- [ ] **Step 11: 创建 src/main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
```

- [ ] **Step 12: 创建 src/App.tsx**

```typescript
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import UploadPage from './pages/UploadPage'
import AnalysisPage from './pages/AnalysisPage'
import ReportPage from './pages/ReportPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/upload/:caseId" element={<UploadPage />} />
        <Route path="/analysis/:caseId" element={<AnalysisPage />} />
        <Route path="/report/:caseId" element={<ReportPage />} />
      </Routes>
    </Layout>
  )
}
```

- [ ] **Step 13: 安装依赖**

Run: `cd d:/code/app && npm install`

Expected: 依赖安装成功，无报错

- [ ] **Step 14: 验证脚手架可运行**

Run: `cd d:/code/app && npx vite --host 0.0.0.0`

Expected: 开发服务器启动在 localhost:3000

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "feat: scaffold React + Vite + TypeScript + Tailwind project"
```

---

### Task 2: 后端项目脚手架

**Files:**
- Create: `app/server/package.json`
- Create: `app/server/tsconfig.json`
- Create: `app/server/src/index.ts`
- Create: `app/server/src/types.ts`

- [ ] **Step 1: 创建 server/package.json**

```json
{
  "name": "ai-mediator-server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1",
    "@anthropic-ai/sdk": "^0.27.0",
    "sharp": "^0.33.4"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.14.2",
    "tsx": "^4.15.4",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 2: 创建 server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 server/src/types.ts**

```typescript
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
```

- [ ] **Step 4: 创建 server/src/index.ts**

```typescript
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { casesRouter } from './routes/cases.js'
import { ocrRouter } from './routes/ocr.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.use('/api/cases', casesRouter)
app.use('/api/ocr', ocrRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
```

- [ ] **Step 5: 安装后端依赖**

Run: `cd d:/code/app/server && npm install`

Expected: 依赖安装成功

- [ ] **Step 6: 验证后端可启动**

Run: `cd d:/code/app/server && npx tsx src/index.ts`

Expected: `Server running on http://localhost:3001`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Express backend server"
```

---

### Task 3: 类型定义 & 工具层

**Files:**
- Create: `app/src/types/index.ts`
- Create: `app/src/utils/storage.ts`
- Create: `app/src/services/api.ts`

- [ ] **Step 1: 创建 src/types/index.ts**

```typescript
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

export type AnalysisStep =
  | 'extracting'
  | 'parsing'
  | 'understanding'
  | 'analyzing'
  | 'generating'
  | 'done'
  | 'error';

export interface AnalysisProgress {
  step: AnalysisStep;
  message: string;
  progress: number; // 0-100
}
```

- [ ] **Step 2: 创建 src/utils/storage.ts**

```typescript
import { openDB, IDBPDatabase } from 'idb';
import type { Case } from '../types';

const DB_NAME = 'ai-mediator';
const DB_VERSION = 1;

let db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (db) return db;
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('cases')) {
        const store = database.createObjectStore('cases', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    },
  });
  return db;
}

export async function saveCase(c: Case): Promise<void> {
  const database = await getDB();
  await database.put('cases', { ...c, updatedAt: new Date().toISOString() });
}

export async function getCase(id: string): Promise<Case | undefined> {
  const database = await getDB();
  return database.get('cases', id);
}

export async function getAllCases(): Promise<Case[]> {
  const database = await getDB();
  const cases = await database.getAll('cases');
  return cases.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function deleteCase(id: string): Promise<void> {
  const database = await getDB();
  await database.delete('cases', id);
}
```

- [ ] **Step 3: 创建 src/services/api.ts**

```typescript
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

  if (!res.ok || !res.body) throw new Error('Analysis failed');

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
          onProgress(parsed as AnalysisProgress);
        } else if (parsed.type === 'result') {
          result = parsed.analysis;
        }
      } catch {
        // skip malformed chunks
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
      fullContent += data;
      onChunk(data);
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
```

- [ ] **Step 4: 验证编译**

Run: `cd d:/code/app && npx tsc --noEmit`

Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add types, storage utils, and API client"
```

---

### Task 4: 基础 UI 组件

**Files:**
- Create: `app/src/components/Layout.tsx`
- Create: `app/src/components/Header.tsx`
- Create: `app/src/components/CaseCard.tsx`

- [ ] **Step 1: 创建 Layout.tsx**

```typescript
import { type ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 pb-8">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 创建 Header.tsx**

```typescript
import { useNavigate, useLocation } from 'react-router-dom'

export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <header className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!isHome && (
            <button
              onClick={() => navigate(-1)}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h1
            className="text-lg font-bold cursor-pointer flex items-center gap-2"
            onClick={() => navigate('/')}
          >
            <span className="text-gold-500 text-xl">⚖️</span>
            <span className="bg-gradient-to-r from-brand-400 to-gold-400 bg-clip-text text-transparent">
              AI 调解员
            </span>
          </h1>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: 创建 CaseCard.tsx**

```typescript
import { useNavigate } from 'react-router-dom'
import type { Case } from '../types'

export default function CaseCard({ c }: { c: Case }) {
  const navigate = useNavigate()
  const hasAnalysis = c.analysis !== null

  return (
    <div
      onClick={() => navigate(hasAnalysis ? `/report/${c.id}` : `/upload/${c.id}`)}
      className="card cursor-pointer hover:border-gray-700 transition-all duration-200 active:scale-[0.98]"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-gray-100">{c.title || '未命名案例'}</h3>
        {hasAnalysis ? (
          <span className="text-xs px-2 py-1 rounded-full bg-green-900/50 text-green-400 border border-green-800">
            已分析
          </span>
        ) : (
          <span className="text-xs px-2 py-1 rounded-full bg-yellow-900/50 text-yellow-400 border border-yellow-800">
            待分析
          </span>
        )}
      </div>

      <div className="text-sm text-gray-500 space-y-1">
        <p>证据数：{c.evidence.length} 份</p>
        <p>创建时间：{new Date(c.createdAt).toLocaleDateString('zh-CN')}</p>
      </div>

      {hasAnalysis && c.analysis && (
        <p className="mt-3 text-sm text-gray-400 line-clamp-2">
          {c.analysis.summary}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 验证编译**

Run: `cd d:/code/app && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Layout, Header, and CaseCard components"
```

---

### Task 5: 首页 & 路由占位页

**Files:**
- Create: `app/src/pages/HomePage.tsx`
- Create: `app/src/pages/UploadPage.tsx` (占位)
- Create: `app/src/pages/AnalysisPage.tsx` (占位)
- Create: `app/src/pages/ReportPage.tsx` (占位)

- [ ] **Step 1: 创建 HomePage.tsx**

```typescript
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import CaseCard from '../components/CaseCard'
import { getAllCases, deleteCase } from '../utils/storage'
import type { Case } from '../types'

export default function HomePage() {
  const navigate = useNavigate()
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCases()
  }, [])

  async function loadCases() {
    setLoading(true)
    const all = await getAllCases()
    setCases(all)
    setLoading(false)
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('确定要删除这个案例吗？')) return
    await deleteCase(id)
    setCases(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div>
      <Header />

      <div className="mt-6 mb-8 text-center">
        <div className="text-5xl mb-4">⚖️</div>
        <h2 className="text-2xl font-bold text-gray-100 mb-2">AI 调解员</h2>
        <p className="text-gray-500 text-sm">
          上传聊天记录截图，让 AI 帮你分析谁对谁错
        </p>
      </div>

      <button
        onClick={() => navigate('/upload')}
        className="btn-primary w-full mb-8 flex items-center justify-center gap-2 text-lg"
      >
        <span>+</span>
        <span>新建调解案例</span>
      </button>

      {loading ? (
        <div className="text-center text-gray-500 py-8">加载中...</div>
      ) : cases.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-2">还没有案例</p>
          <p className="text-gray-600 text-sm">点击上方按钮创建第一个调解案例</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map(c => (
            <div key={c.id} className="relative group">
              <CaseCard c={c} />
              <button
                onClick={(e) => handleDelete(c.id, e)}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity
                  text-gray-600 hover:text-red-400 p-1"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建占位页面**

```typescript
// UploadPage.tsx
export default function UploadPage() {
  return (
    <div className="mt-6">
      <h2 className="text-xl font-bold text-gray-100">上传证据</h2>
      <p className="text-gray-500 mt-2">页面建设中...</p>
    </div>
  )
}
```

其他占位页面使用相同的结构，替换标题文本：
- `AnalysisPage.tsx` — 标题"正在分析"
- `ReportPage.tsx` — 标题"分析报告"

- [ ] **Step 3: 验证编译并运行**

Run: `cd d:/code/app && npx tsc --noEmit && npm run dev`

Expected: 首页正常显示

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add HomePage with case list and route placeholders"
```

---

### Task 6: 上传页面 & OCR 集成

**Files:**
- Create: `app/src/components/UploadZone.tsx`
- Create: `app/src/components/PartyForm.tsx`
- Create: `app/src/components/EvidenceUpload.tsx`
- Create: `app/src/utils/ocr.ts`
- Rewrite: `app/src/pages/UploadPage.tsx`

- [ ] **Step 1: 创建 src/utils/ocr.ts**

```typescript
import Tesseract from 'tesseract.js'

export async function extractTextFromImage(file: File): Promise<string> {
  const imageUrl = URL.createObjectURL(file)
  try {
    const { data } = await Tesseract.recognize(imageUrl, 'chi_sim+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          // progress could be emitted here
        }
      },
    })
    return data.text
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

export async function extractFramesFromVideo(
  file: File,
  intervalSec: number = 2
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true

    const url = URL.createObjectURL(file)
    video.src = url

    video.onloadedmetadata = async () => {
      const duration = video.duration
      const frames: string[] = []
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      for (let t = 0; t < duration; t += intervalSec) {
        video.currentTime = t
        await new Promise<void>((r) => {
          video.onseeked = () => {
            ctx.drawImage(video, 0, 0)
            frames.push(canvas.toDataURL('image/png'))
            r()
          }
        })
      }

      URL.revokeObjectURL(url)
      resolve(frames)
    }

    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('视频加载失败'))
    }
  })
}

export async function extractTextFromVideo(
  file: File,
  onProgress?: (msg: string) => void
): Promise<string> {
  onProgress?.('正在提取视频关键帧...')
  const frames = await extractFramesFromVideo(file, 3)

  onProgress?.(`已提取 ${frames.length} 帧，正在 OCR 识别...`)
  const texts: string[] = []
  for (let i = 0; i < frames.length; i++) {
    onProgress?.(`OCR 识别中 ${i + 1}/${frames.length}...`)
    const img = await fetch(frames[i]).then(r => r.blob())
    const text = await extractTextFromImage(new File([img], `frame_${i}.png`))
    if (text.trim()) texts.push(text)
  }

  return texts.join('\n')
}
```

- [ ] **Step 2: 创建 UploadZone.tsx**

```typescript
import { useCallback, useState, useRef } from 'react'

interface Props {
  onFilesSelected: (files: File[]) => void
  accept: 'image/*' | 'video/*' | 'image/*,video/*'
  multiple?: boolean
  label: string
  hint: string
}

export default function UploadZone({ onFilesSelected, accept, multiple, label, hint }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) onFilesSelected(files)
    },
    [onFilesSelected]
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) onFilesSelected(files)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
        ${isDragging
          ? 'border-brand-500 bg-brand-500/10'
          : 'border-gray-700 hover:border-gray-500 bg-gray-900/50'
        }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
      <div className="text-4xl mb-3">📤</div>
      <p className="text-gray-300 font-medium mb-1">{label}</p>
      <p className="text-gray-500 text-sm">{hint}</p>
    </div>
  )
}
```

- [ ] **Step 3: 创建 PartyForm.tsx**

```typescript
import { useState } from 'react'

interface Props {
  onConfirm: (parties: { name: string; role: string }[]) => void
}

export default function PartyForm({ onConfirm }: Props) {
  const [partyA, setPartyA] = useState('')
  const [partyB, setPartyB] = useState('')
  const [relationship, setRelationship] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!partyA.trim() || !partyB.trim()) return
    onConfirm([
      { name: partyA.trim(), role: 'party_a' },
      { name: partyB.trim(), role: 'party_b' },
    ])
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h3 className="text-lg font-semibold text-gray-100">👥 人物信息</h3>

      <div>
        <label className="block text-sm text-gray-400 mb-1">甲方（先说话的人 / 原告）</label>
        <input
          className="input-field"
          value={partyA}
          onChange={(e) => setPartyA(e.target.value)}
          placeholder="输入姓名或昵称"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">乙方（另一方 / 被告）</label>
        <input
          className="input-field"
          value={partyB}
          onChange={(e) => setPartyB(e.target.value)}
          placeholder="输入姓名或昵称"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">关系类型（选填）</label>
        <select
          className="input-field"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
        >
          <option value="">不指定，让 AI 判断</option>
          <option value="couple">情侣</option>
          <option value="friends">朋友</option>
          <option value="colleagues">同事</option>
          <option value="family">家人</option>
          <option value="other">其他</option>
        </select>
      </div>

      <button type="submit" className="btn-primary w-full">
        确认人物信息
      </button>
    </form>
  )
}
```

- [ ] **Step 4: 创建 EvidenceUpload.tsx**

```typescript
import { useState } from 'react'
import UploadZone from './UploadZone'
import { extractTextFromImage, extractTextFromVideo } from '../utils/ocr'

interface Props {
  source: 'party_a' | 'party_b' | 'self'
  partyName?: string
  onTextExtracted: (text: string, source: string) => void
}

export default function EvidenceUpload({ source, partyName, onTextExtracted }: Props) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')

  const sourceLabel =
    source === 'self' ? '我' : partyName || (source === 'party_a' ? '甲方' : '乙方')

  async function handleFiles(files: File[]) {
    setProcessing(true)
    const allText: string[] = []

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        setProgress(`正在识别图片: ${file.name}`)
        const text = await extractTextFromImage(file)
        if (text.trim()) allText.push(text)
      } else if (file.type.startsWith('video/')) {
        setProgress(`正在处理视频: ${file.name}`)
        const text = await extractTextFromVideo(file, (msg) => setProgress(msg))
        if (text.trim()) allText.push(text)
      }
    }

    if (allText.length > 0) {
      onTextExtracted(allText.join('\n---\n'), source)
    }

    setProcessing(false)
    setProgress('')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-300">
          {sourceLabel}的证据
        </span>
        <span className="text-xs text-gray-600">上传截图或录屏</span>
      </div>

      <UploadZone
        onFilesSelected={handleFiles}
        accept="image/*,video/*"
        multiple
        label={`上传${sourceLabel}的聊天截图或录屏`}
        hint="支持微信截图、录屏，批量上传"
      />

      {processing && (
        <div className="card bg-brand-950/30 border-brand-800">
          <div className="flex items-center gap-3">
            <div className="animate-spin text-xl">⏳</div>
            <p className="text-brand-300 text-sm">{progress}</p>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 重写 UploadPage.tsx**

```typescript
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Header from '../components/Header'
import PartyForm from '../components/PartyForm'
import EvidenceUpload from '../components/EvidenceUpload'
import { createCase } from '../services/api'
import { saveCase } from '../utils/storage'
import type { Case } from '../types'

export default function UploadPage() {
  const navigate = useNavigate()
  const { caseId } = useParams<{ caseId?: string }>()
  const [currentCase, setCurrentCase] = useState<Case | null>(null)
  const [step, setStep] = useState<'parties' | 'evidence' | 'done'>('parties')
  const [evidenceTexts, setEvidenceTexts] = useState<
    { text: string; source: string }[]
  >([])

  async function handlePartiesConfirmed(
    parties: { name: string; role: string }[]
  ) {
    const c = await createCase(`${parties[0]?.name || '?'} vs ${parties[1]?.name || '?'}`)
    c.parties = parties
    await saveCase(c)
    setCurrentCase(c)
    setStep('evidence')
  }

  function handleTextExtracted(text: string, source: string) {
    setEvidenceTexts((prev) => [...prev, { text, source }])
  }

  async function handleAnalyze() {
    if (!currentCase) return
    const allText = evidenceTexts
      .map((e) => `[来源: ${e.source}]\n${e.text}`)
      .join('\n\n')
    currentCase.rawText = allText
    currentCase.evidence = evidenceTexts.map((e, i) => ({
      id: `ev_${i}`,
      type: 'screenshot' as const,
      source: e.source as 'party_a' | 'party_b' | 'self',
      fileName: '',
      extractedText: e.text,
      uploadedAt: new Date().toISOString(),
    }))
    await saveCase(currentCase)
    navigate(`/analysis/${currentCase.id}`)
  }

  return (
    <div>
      <Header />

      <div className="mt-6 space-y-6">
        {step === 'parties' && (
          <PartyForm onConfirm={handlePartiesConfirmed} />
        )}

        {step === 'evidence' && currentCase && (
          <div className="space-y-6">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-100 mb-2">
                📋 {currentCase.title}
              </h3>
              <div className="flex gap-2 text-sm text-gray-400">
                {currentCase.parties.map((p) => (
                  <span key={p.role} className="px-2 py-1 bg-gray-800 rounded-lg">
                    {p.name} ({p.role === 'party_a' ? '甲方' : '乙方'})
                  </span>
                ))}
              </div>
            </div>

            <EvidenceUpload
              source="party_a"
              partyName={currentCase.parties.find((p) => p.role === 'party_a')?.name}
              onTextExtracted={handleTextExtracted}
            />

            <EvidenceUpload
              source="party_b"
              partyName={currentCase.parties.find((p) => p.role === 'party_b')?.name}
              onTextExtracted={handleTextExtracted}
            />

            <EvidenceUpload
              source="self"
              onTextExtracted={handleTextExtracted}
            />

            {evidenceTexts.length > 0 && (
              <div className="card">
                <h4 className="font-medium text-gray-200 mb-2">
                  已提取 {evidenceTexts.length} 份证据
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {evidenceTexts.map((e, i) => (
                    <details key={i} className="text-sm">
                      <summary className="text-gray-400 cursor-pointer">
                        证据 {i + 1} — 来源: {e.source}（{e.text.length} 字）
                      </summary>
                      <pre className="mt-1 p-2 bg-gray-950 rounded text-gray-500 text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {e.text.slice(0, 500)}
                        {e.text.length > 500 ? '...' : ''}
                      </pre>
                    </details>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={evidenceTexts.length === 0}
              className="btn-primary w-full text-lg"
            >
              ⚖️ 开始分析
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 验证编译**

Run: `cd d:/code/app && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add upload page with OCR, party form, and evidence collection"
```

---

### Task 7: 后端路由 — 案例管理

**Files:**
- Create: `app/server/src/routes/cases.ts`

- [ ] **Step 1: 创建 routes/cases.ts**

```typescript
import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Case } from '../types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const upload = multer({
  dest: path.join(__dirname, '../../uploads'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
})

export const casesRouter = Router()

const cases = new Map<string, Case>()

casesRouter.get('/', (_req: Request, res: Response) => {
  const all = Array.from(cases.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  res.json(all)
})

casesRouter.get('/:id', (req: Request, res: Response) => {
  const c = cases.get(req.params.id)
  if (!c) {
    res.status(404).json({ error: 'Case not found' })
    return
  }
  res.json(c)
})

casesRouter.post('/', (req: Request, res: Response) => {
  const c: Case = req.body
  cases.set(c.id, c)
  res.status(201).json(c)
})

casesRouter.patch('/:id', (req: Request, res: Response) => {
  const existing = cases.get(req.params.id)
  if (!existing) {
    res.status(404).json({ error: 'Case not found' })
    return
  }
  const updated = { ...existing, ...req.body, updatedAt: new Date().toISOString() }
  cases.set(req.params.id, updated)
  res.json(updated)
})

casesRouter.post(
  '/:id/evidence',
  upload.single('file'),
  (req: Request, res: Response) => {
    const c = cases.get(req.params.id)
    if (!c) {
      res.status(404).json({ error: 'Case not found' })
      return
    }
    // Evidence is processed client-side with OCR; here we just register it
    const evidenceId = `ev_${Date.now()}`
    const source = (req.body.source as 'party_a' | 'party_b' | 'self') || 'self'
    const evidence = {
      id: evidenceId,
      type: 'screenshot' as const,
      source,
      fileName: req.file?.originalname || '',
      extractedText: '',
      uploadedAt: new Date().toISOString(),
    }
    c.evidence.push(evidence)
    c.updatedAt = new Date().toISOString()
    res.json({ evidenceId, extractedText: '' })
  }
)

casesRouter.post(
  '/:id/evidence/text',
  (req: Request, res: Response) => {
    const c = cases.get(req.params.id)
    if (!c) {
      res.status(404).json({ error: 'Case not found' })
      return
    }
    const { text, source } = req.body
    const evidenceId = `ev_${Date.now()}`
    c.evidence.push({
      id: evidenceId,
      type: 'text',
      source: source || 'self',
      fileName: '',
      extractedText: text,
      uploadedAt: new Date().toISOString(),
    })
    c.updatedAt = new Date().toISOString()
    res.json({ evidenceId, extractedText: text })
  }
)
```

- [ ] **Step 2: 验证后端路由编译**

Run: `cd d:/code/app/server && npx tsc --noEmit`

Expected: 无编译错误（路由模块会从 index.ts 导入）

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add backend case CRUD routes with file upload"
```

---

### Task 8: 聊天解析器 & LLM 分析服务

**Files:**
- Create: `app/server/src/services/parser.ts`
- Create: `app/server/src/services/llm.ts`

- [ ] **Step 1: 创建 services/parser.ts**

```typescript
interface ParsedMessage {
  speaker: string
  content: string
  timestamp: string | null
  type: 'text' | 'voice' | 'sticker' | 'image' | 'system'
}

export function parseWeChatChatLog(rawText: string): ParsedMessage[] {
  const lines = rawText.split('\n').filter((l) => l.trim())
  const messages: ParsedMessage[] = []

  const wechatLineRegex =
    /^(\d{1,2}[-/]\d{1,2}[-/]\s*\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)$/

  const speakerContentRegex = /^(.+?)[：:]\s*(.*)$/

  let currentSpeaker = ''
  let currentTime: string | null = null

  for (const line of lines) {
    const timeMatch = line.match(wechatLineRegex)
    if (timeMatch) {
      currentTime = timeMatch[1].trim()
      const rest = timeMatch[2]
      const scMatch = rest.match(speakerContentRegex)
      if (scMatch) {
        currentSpeaker = scMatch[1].trim()
        const content = scMatch[2].trim()
        messages.push({
          speaker: currentSpeaker,
          content,
          timestamp: currentTime,
          type: classifyMessage(content),
        })
      } else {
        messages.push({
          speaker: currentSpeaker || '未知',
          content: rest,
          timestamp: currentTime,
          type: 'text',
        })
      }
    } else {
      const scMatch = line.match(speakerContentRegex)
      if (scMatch) {
        currentSpeaker = scMatch[1].trim()
        messages.push({
          speaker: currentSpeaker,
          content: scMatch[2].trim(),
          timestamp: null,
          type: classifyMessage(scMatch[2]),
        })
      } else if (currentSpeaker && line.trim()) {
        const lastMsg = messages[messages.length - 1]
        if (lastMsg && lastMsg.speaker === currentSpeaker) {
          lastMsg.content += '\n' + line.trim()
        }
      }
    }
  }

  return messages
}

function classifyMessage(content: string): ParsedMessage['type'] {
  if (/^\[语音\]|^\[Voice\]/i.test(content)) return 'voice'
  if (/^\[表情\]|^\[Sticker\]|^\[动画表情\]/i.test(content)) return 'sticker'
  if (/^\[图片\]|^\[Image\]|^\[照片\]/i.test(content)) return 'image'
  if (/^(你撤回了一条消息|对方撤回了一条消息|[\[<]系统消息)/.test(content))
    return 'system'
  return 'text'
}

export function formatChatForLLM(
  messages: ParsedMessage[],
  parties: { name: string; role: string }[]
): string {
  const labelMap: Record<string, string> = {}
  for (const p of parties) {
    labelMap[p.name] = p.role === 'party_a' ? '甲方' : '乙方'
  }

  return messages
    .map((m) => {
      const label = labelMap[m.speaker] || m.speaker
      const time = m.timestamp ? `[${m.timestamp}]` : ''
      const typeTag = m.type !== 'text' ? `(${m.type})` : ''
      return `${time} ${label}${typeTag}: ${m.content}`
    })
    .join('\n')
}
```

- [ ] **Step 2: 创建 services/llm.ts**

```typescript
import type { Analysis, ChatMessage } from '../types.js'

interface LLMConfig {
  apiKey: string
  model: string
  baseUrl?: string
}

function getConfig(): LLMConfig {
  return {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
    baseUrl: process.env.LLM_BASE_URL,
  }
}

const ANALYSIS_PROMPT = `你是一位经验丰富的情感调解专家和仲裁员。你的任务是基于提供的聊天记录，进行客观、深入的分析。

请严格按照以下 JSON 格式返回分析结果（不要包含任何其他文字）：

{
  "summary": "一句话概括本次冲突的核心",
  "relationship": "判断的人物关系（如：情侣、朋友、同事、家人等）",
  "characters": [
    {
      "name": "人物名称",
      "role": "party_a 或 party_b 或 other",
      "personality": "性格特点分析",
      "stance": "其核心立场和诉求",
      "emotionalState": "当前情绪状态"
    }
  ],
  "timeline": [
    {
      "timestamp": "时间",
      "speaker": "说话人",
      "content": "关键对话内容摘要",
      "emotion": "情绪标签（如生气/委屈/冷静/伤心等）",
      "significance": "为什么这条消息重要"
    }
  ],
  "conflicts": [
    {
      "topic": "争议话题",
      "partyAStance": "甲方立场",
      "partyBStance": "乙方立场",
      "aiJudgment": "AI 的客观判断",
      "winner": "更有理的一方：a 或 b 或 tie"
    }
  ],
  "verdict": {
    "summary": "综合判断总结",
    "scoreA": 60,
    "scoreB": 40,
    "reasoning": ["理由1", "理由2", "理由3"],
    "overallWinner": "a 或 b 或 tie"
  },
  "advice": {
    "toA": ["给甲方的具体建议1", "建议2"],
    "toB": ["给乙方的具体建议1", "建议2"],
    "toBoth": ["双方应该共同注意的事项"]
  }
}

评分规则：
- scoreA + scoreB = 100
- 分数高的一方代表更有理
- 请基于客观事实判断，不要被情绪化语言左右
- 考虑到聊天记录可能不完整，请在判断时留有余地

请用中文输出所有内容。`

export async function analyzeChat(
  formattedChat: string,
  parties: { name: string; role: string }[],
  caseContext: string,
  onProgress?: (step: string, progress: number) => void
): Promise<Analysis> {
  const config = getConfig()
  if (!config.apiKey) {
    throw new Error('Missing API key. Set ANTHROPIC_API_KEY environment variable.')
  }

  const partyInfo = parties
    .map((p) => `- ${p.role === 'party_a' ? '甲方' : '乙方'}: ${p.name}`)
    .join('\n')

  const prompt = `${ANALYSIS_PROMPT}

---
## 案件背景
${caseContext || '无额外背景信息'}

## 当事人信息
${partyInfo}

## 聊天记录
${formattedChat}
---
请分析以上聊天记录，输出 JSON 格式的分析结果。`

  onProgress?.('正在理解对话上下文...', 20)

  const response = await fetch(
    config.baseUrl || 'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`LLM API error: ${response.status} ${err}`)
  }

  onProgress?.('正在分析人物关系...', 40)
  onProgress?.('正在定位冲突节点...', 60)

  const data = await response.json()
  const text = data.content?.[0]?.text || ''

  onProgress?.('正在生成分析报告...', 80)

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse JSON from LLM response')
  }

  onProgress?.('分析完成！', 100)

  return JSON.parse(jsonMatch[0]) as Analysis
}

export async function chatWithAnalysis(
  context: string,
  history: ChatMessage[],
  newMessage: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const config = getConfig()

  const messages = [
    {
      role: 'system' as const,
      content: `你是一位情感调解专家。基于之前的案例分析，回答用户的追问。请保持客观、中肯。请用中文回答。

## 之前的分析报告
${context}`,
    },
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: newMessage },
  ]

  const response = await fetch(
    config.baseUrl || 'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 2048,
        messages,
        stream: true,
      }),
    }
  )

  if (!response.ok) {
    throw new Error(`LLM chat error: ${response.status}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n').filter((l) => l.startsWith('data: '))

    for (const line of lines) {
      const data = line.slice(6)
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data)
        if (parsed.type === 'content_block_delta') {
          const text = parsed.delta?.text || ''
          fullText += text
          onChunk(text)
        }
      } catch {
        // skip
      }
    }
  }

  return fullText
}
```

- [ ] **Step 3: 验证服务端编译**

Run: `cd d:/code/app/server && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add WeChat chat parser and LLM analysis service"
```

---

### Task 9: 分析 & 追问 API 路由

**Files:**
- Create: `app/server/src/routes/ocr.ts`
- Modify: `app/server/src/routes/cases.ts` (追加 analyze 和 chat 端点)

- [ ] **Step 1: 创建 routes/ocr.ts**

```typescript
import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const upload = multer({
  dest: path.join(__dirname, '../../uploads'),
  limits: { fileSize: 50 * 1024 * 1024 },
})

export const ocrRouter = Router()

// This is a server-side OCR fallback
// Primary OCR is done client-side with Tesseract.js
ocrRouter.post(
  '/',
  upload.single('image'),
  (_req: Request, res: Response) => {
    // Server-side OCR would go here (e.g., using sharp + tesseract)
    // For MVP, we return a placeholder indicating client-side OCR should be used
    res.json({
      text: '',
      note: 'OCR should be performed client-side with Tesseract.js for privacy',
    })
  }
)
```

- [ ] **Step 2: 追加分析 & 追问端点**

在 `routes/cases.ts` 的末尾（在 `export const casesRouter` 行之前）追加：

```typescript
// --- Analysis endpoint ---
casesRouter.post('/:id/analyze', async (req: Request, res: Response) => {
  const c = cases.get(req.params.id)
  if (!c) {
    res.status(404).json({ error: 'Case not found' })
    return
  }

  // Combine all evidence texts
  const allText = c.evidence.map((e) => e.extractedText).filter(Boolean).join('\n\n')
  if (!allText.trim()) {
    res.status(400).json({ error: 'No text content found in evidence' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    const { parseWeChatChatLog, formatChatForLLM } = await import('../services/parser.js')
    const { analyzeChat } = await import('../services/llm.js')

    // Step 1: Parse
    res.write(
      `data: ${JSON.stringify({ type: 'progress', step: 'parsing', message: '正在解析聊天记录...', progress: 10 })}\n\n`
    )

    const messages = parseWeChatChatLog(allText)
    const formatted = formatChatForLLM(messages, c.parties)

    // Step 2-5: Analyze with progress
    const analysis = await analyzeChat(
      formatted,
      c.parties,
      '',
      (step, progress) => {
        res.write(
          `data: ${JSON.stringify({ type: 'progress', step: 'analyzing', message: step, progress })}\n\n`
        )
      }
    )

    analysis.id = `analysis_${Date.now()}`
    analysis.caseId = c.id
    analysis.createdAt = new Date().toISOString()

    c.analysis = analysis
    c.rawText = allText
    c.updatedAt = new Date().toISOString()

    res.write(
      `data: ${JSON.stringify({ type: 'result', analysis })}\n\n`
    )
    res.write(`data: [DONE]\n\n`)
    res.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.write(
      `data: ${JSON.stringify({ type: 'progress', step: 'error', message, progress: 0 })}\n\n`
    )
    res.end()
  }
})

// --- Chat endpoint ---
casesRouter.post('/:id/chat', async (req: Request, res: Response) => {
  const c = cases.get(req.params.id)
  if (!c) {
    res.status(404).json({ error: 'Case not found' })
    return
  }
  if (!c.analysis) {
    res.status(400).json({ error: 'No analysis found. Run analysis first.' })
    return
  }

  const { content } = req.body
  if (!content?.trim()) {
    res.status(400).json({ error: 'Message content required' })
    return
  }

  // Add user message
  const userMsg = {
    id: `msg_${Date.now()}`,
    role: 'user' as const,
    content: content.trim(),
    timestamp: new Date().toISOString(),
  }
  c.chatHistory.push(userMsg)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    const { chatWithAnalysis } = await import('../services/llm.js')

    const fullResponse = await chatWithAnalysis(
      JSON.stringify(c.analysis, null, 2),
      c.chatHistory.slice(0, -1), // exclude the just-added user message
      content,
      (chunk) => {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }
    )

    const assistantMsg = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant' as const,
      content: fullResponse,
      timestamp: new Date().toISOString(),
    }
    c.chatHistory.push(assistantMsg)

    res.write(`data: [DONE]\n\n`)
    res.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
    res.end()
  }
})
```

- [ ] **Step 3: 验证编译**

Run: `cd d:/code/app/server && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add analysis and chat SSE endpoints"
```

---

### Task 10: 分析进度 & 报告页面

**Files:**
- Create: `app/src/components/AnalysisProgress.tsx`
- Rewrite: `app/src/pages/AnalysisPage.tsx`
- Create: `app/src/components/ReportSummary.tsx`
- Create: `app/src/components/CharacterMap.tsx`
- Create: `app/src/components/Timeline.tsx`
- Create: `app/src/components/VerdictCard.tsx`
- Create: `app/src/components/AdviceCard.tsx`
- Create: `app/src/components/ChatPanel.tsx`
- Create: `app/src/hooks/useCase.ts`
- Create: `app/src/hooks/useAnalysis.ts`
- Rewrite: `app/src/pages/ReportPage.tsx`

- [ ] **Step 1: 创建 hooks/useCase.ts**

```typescript
import { useState, useEffect, useCallback } from 'react'
import { getCase as fetchCase, saveCase as persistCase } from '../utils/storage'
import type { Case } from '../types'

export function useCase(caseId: string | undefined) {
  const [c, setCase] = useState<Case | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!caseId) { setLoading(false); return }
    fetchCase(caseId).then((data) => {
      setCase(data || null)
      setLoading(false)
    })
  }, [caseId])

  const updateCase = useCallback(
    async (updates: Partial<Case>) => {
      if (!c) return
      const updated = { ...c, ...updates, updatedAt: new Date().toISOString() }
      setCase(updated)
      await persistCase(updated)
    },
    [c]
  )

  return { c, loading, updateCase }
}
```

- [ ] **Step 2: 创建 hooks/useAnalysis.ts**

```typescript
import { useState, useCallback } from 'react'
import { triggerAnalysis, sendMessage } from '../services/api'
import type { Analysis, ChatMessage, AnalysisProgress } from '../types'

export function useAnalysis() {
  const [progress, setProgress] = useState<AnalysisProgress | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runAnalysis = useCallback(async (caseId: string) => {
    setError(null)
    setProgress({ step: 'extracting', message: '准备中...', progress: 0 })

    try {
      const result = await triggerAnalysis(caseId, (p) => setProgress(p))
      setAnalysis(result)
      setProgress({ step: 'done', message: '分析完成', progress: 100 })
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : '分析失败'
      setError(msg)
      setProgress({ step: 'error', message: msg, progress: 0 })
      return null
    }
  }, [])

  const askQuestion = useCallback(
    async (
      caseId: string,
      question: string,
      onChunk: (chunk: string) => void
    ): Promise<ChatMessage | null> => {
      try {
        return await sendMessage(caseId, question, onChunk)
      } catch (err) {
        setError(err instanceof Error ? err.message : '发送失败')
        return null
      }
    },
    []
  )

  return { progress, analysis, error, runAnalysis, askQuestion, setAnalysis }
}
```

- [ ] **Step 3: 创建 AnalysisProgress.tsx**

```typescript
import type { AnalysisProgress } from '../types'

const STEP_LABELS: Record<string, string> = {
  extracting: '📄 提取聊天内容',
  parsing: '🔍 解析对话结构',
  understanding: '🧠 理解上下文语义',
  analyzing: '⚖️ 分析冲突与对错',
  generating: '📝 生成分析报告',
  done: '✅ 分析完成',
  error: '❌ 分析出错',
}

export default function AnalysisProgress({ progress }: { progress: AnalysisProgress }) {
  const isError = progress.step === 'error'
  const isDone = progress.step === 'done'

  return (
    <div className="card text-center py-12">
      {isError ? (
        <div className="text-5xl mb-4">❌</div>
      ) : isDone ? (
        <div className="text-5xl mb-4">✅</div>
      ) : (
        <div className="text-5xl mb-4 animate-bounce">⚖️</div>
      )}

      <h3 className="text-lg font-semibold text-gray-100 mb-2">
        {STEP_LABELS[progress.step] || progress.message}
      </h3>
      <p className="text-gray-500 text-sm mb-4">{progress.message}</p>

      {!isError && !isDone && (
        <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-gold-500 rounded-full transition-all duration-500"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
      )}

      {isError && (
        <p className="text-red-400 text-sm mt-2">{progress.message}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 重写 AnalysisPage.tsx**

```typescript
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Header from '../components/Header'
import AnalysisProgress from '../components/AnalysisProgress'
import { useCase } from '../hooks/useCase'
import { useAnalysis } from '../hooks/useAnalysis'

export default function AnalysisPage() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const { c } = useCase(caseId)
  const { progress, runAnalysis } = useAnalysis()

  useEffect(() => {
    if (!caseId) { navigate('/'); return }
    runAnalysis(caseId).then((result) => {
      if (result) {
        setTimeout(() => navigate(`/report/${caseId}`), 1500)
      }
    })
  }, [caseId])

  return (
    <div>
      <Header />
      <div className="mt-6">
        {c && (
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-100">{c.title}</h2>
            <p className="text-gray-500 text-sm mt-1">
              {c.parties.map((p) => p.name).join(' vs ')}
            </p>
          </div>
        )}
        {progress ? (
          <AnalysisProgress progress={progress} />
        ) : (
          <div className="card text-center py-12">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            <p className="text-gray-400">准备分析...</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 创建报告子组件**

**ReportSummary.tsx**:

```typescript
import type { Analysis } from '../types'

export default function ReportSummary({ analysis }: { analysis: Analysis }) {
  return (
    <div className="card bg-gradient-to-br from-brand-950 to-gray-900 border-brand-800/50">
      <h3 className="text-sm text-brand-400 font-medium mb-2">📋 案情摘要</h3>
      <p className="text-gray-200 text-lg font-medium leading-relaxed">
        {analysis.summary}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-400">
          {analysis.relationship}
        </span>
      </div>
    </div>
  )
}
```

**CharacterMap.tsx**:

```typescript
import type { Character } from '../types'

export default function CharacterMap({ characters }: { characters: Character[] }) {
  return (
    <div className="card">
      <h3 className="text-sm text-brand-400 font-medium mb-3">👥 人物画像</h3>
      <div className="grid gap-3">
        {characters.map((char, i) => (
          <div key={i} className="bg-gray-800/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-gray-100">{char.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                char.role === 'party_a'
                  ? 'bg-blue-900/50 text-blue-400'
                  : char.role === 'party_b'
                  ? 'bg-pink-900/50 text-pink-400'
                  : 'bg-gray-700 text-gray-400'
              }`}>
                {char.role === 'party_a' ? '甲方' : char.role === 'party_b' ? '乙方' : '其他'}
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-1">{char.personality}</p>
            <p className="text-sm text-gray-500">立场：{char.stance}</p>
            <p className="text-sm text-gray-500">情绪：{char.emotionalState}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Timeline.tsx**:

```typescript
import type { TimelineEvent } from '../types'

const EMOTION_COLORS: Record<string, string> = {
  '生气': 'text-red-400 bg-red-900/30',
  '愤怒': 'text-red-500 bg-red-900/50',
  '委屈': 'text-blue-400 bg-blue-900/30',
  '伤心': 'text-purple-400 bg-purple-900/30',
  '冷静': 'text-green-400 bg-green-900/30',
  '开心': 'text-yellow-400 bg-yellow-900/30',
  '无奈': 'text-gray-400 bg-gray-800',
}

export default function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="card">
      <h3 className="text-sm text-brand-400 font-medium mb-3">⏱️ 关键时间线</h3>
      <div className="space-y-3">
        {events.map((event, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-2 h-2 rounded-full bg-brand-500 mt-1.5" />
              {i < events.length - 1 && (
                <div className="w-px flex-1 bg-gray-800 mt-1" />
              )}
            </div>
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-200">
                  {event.speaker}
                </span>
                {event.timestamp && (
                  <span className="text-xs text-gray-600">{event.timestamp}</span>
                )}
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  EMOTION_COLORS[event.emotion] || 'text-gray-400 bg-gray-800'
                }`}>
                  {event.emotion}
                </span>
              </div>
              <p className="text-sm text-gray-400">{event.content}</p>
              <p className="text-xs text-gray-600 mt-0.5">{event.significance}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**VerdictCard.tsx**:

```typescript
import type { Verdict } from '../types'

export default function VerdictCard({ verdict }: { verdict: Verdict }) {
  const isTie = verdict.overallWinner === 'tie'
  const aWins = verdict.overallWinner === 'a'

  return (
    <div className="card bg-gradient-to-br from-yellow-950/30 to-gray-900 border-yellow-800/30">
      <h3 className="text-sm text-gold-400 font-medium mb-4">⚖️ 仲裁结果</h3>

      {!isTie && (
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 text-center">
            <div className="text-2xl font-bold text-gray-100">{verdict.scoreA}</div>
            <div className="text-xs text-gray-500">甲方合理度</div>
          </div>
          <div className="text-gray-600 text-sm">vs</div>
          <div className="flex-1 text-center">
            <div className="text-2xl font-bold text-gray-100">{verdict.scoreB}</div>
            <div className="text-xs text-gray-500">乙方合理度</div>
          </div>
        </div>
      )}

      {isTie && (
        <div className="text-center mb-4">
          <span className="text-lg text-gold-400 font-semibold">双方各有道理，难分高下</span>
        </div>
      )}

      {!isTie && (
        <p className="text-gold-400 font-semibold mb-3 text-center">
          🏆 {aWins ? '甲方更有理' : '乙方更有理'}
        </p>
      )}

      <p className="text-sm text-gray-300 mb-3">{verdict.summary}</p>

      <div className="space-y-1.5">
        {verdict.reasoning.map((reason, i) => (
          <div key={i} className="flex gap-2 text-sm">
            <span className="text-gold-500 shrink-0">▸</span>
            <span className="text-gray-400">{reason}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**AdviceCard.tsx**:

```typescript
import type { Advice } from '../types'

export default function AdviceCard({ advice, partyNames }: { advice: Advice; partyNames: { a: string; b: string } }) {
  return (
    <div className="card bg-gradient-to-br from-green-950/20 to-gray-900 border-green-800/30">
      <h3 className="text-sm text-green-400 font-medium mb-4">💡 调解建议</h3>

      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">
            给 {partyNames.a} 的建议：
          </h4>
          <ul className="space-y-1.5">
            {advice.toA.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-400">
                <span className="text-blue-400">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">
            给 {partyNames.b} 的建议：
          </h4>
          <ul className="space-y-1.5">
            {advice.toB.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-400">
                <span className="text-pink-400">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">双方的共同建议：</h4>
          <ul className="space-y-1.5">
            {advice.toBoth.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-400">
                <span className="text-green-400">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
```

**ChatPanel.tsx**:

```typescript
import { useState, useRef, useEffect } from 'react'
import type { ChatMessage } from '../types'

interface Props {
  messages: ChatMessage[]
  onSend: (content: string) => void
  streaming: boolean
  streamContent: string
}

export default function ChatPanel({ messages, onSend, streaming, streamContent }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamContent])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || streaming) return
    onSend(input.trim())
    setInput('')
  }

  return (
    <div className="card">
      <h3 className="text-sm text-brand-400 font-medium mb-3">💬 追问调解员</h3>

      <div className="max-h-80 overflow-y-auto space-y-3 mb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-800 text-gray-300'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {streaming && streamContent && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-gray-800 text-gray-300">
              {streamContent}
              <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="input-field flex-1 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="追问更多细节..."
          disabled={streaming}
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          className="btn-primary text-sm px-4 py-2"
        >
          发送
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 6: 重写 ReportPage.tsx**

```typescript
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import EvidenceUpload from '../components/EvidenceUpload'
import ReportSummary from '../components/ReportSummary'
import CharacterMap from '../components/CharacterMap'
import Timeline from '../components/Timeline'
import VerdictCard from '../components/VerdictCard'
import AdviceCard from '../components/AdviceCard'
import ChatPanel from '../components/ChatPanel'
import { useCase } from '../hooks/useCase'
import { useAnalysis } from '../hooks/useAnalysis'
import { saveCase } from '../utils/storage'
import type { ChatMessage, Case } from '../types'

export default function ReportPage() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const { c, updateCase } = useCase(caseId)
  const { askQuestion, setAnalysis } = useAnalysis()
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [showEvidenceUpload, setShowEvidenceUpload] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)

  if (!c || !c.analysis) {
    return (
      <div>
        <Header />
        <div className="card text-center py-12 mt-6">
          <p className="text-gray-500">正在加载报告...</p>
        </div>
      </div>
    )
  }

  const analysis = c.analysis
  const partyA = c.parties.find((p) => p.role === 'party_a')?.name || '甲方'
  const partyB = c.parties.find((p) => p.role === 'party_b')?.name || '乙方'

  async function handleSend(content: string) {
    if (!caseId) return
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    setChatMessages((prev) => [...prev, userMsg])
    setStreaming(true)
    setStreamContent('')

    const response = await askQuestion(caseId, content, (chunk) => {
      setStreamContent((prev) => prev + chunk)
    })

    if (response) {
      setChatMessages((prev) => [...prev, response])
    }
    setStreaming(false)
    setStreamContent('')
  }

  async function handleSupplementText(text: string, source: string) {
    if (!c) return
    const updatedCase: Case = {
      ...c,
      evidence: [
        ...c.evidence,
        {
          id: `ev_${Date.now()}`,
          type: 'screenshot',
          source: source as 'party_a' | 'party_b' | 'self',
          fileName: '',
          extractedText: text,
          uploadedAt: new Date().toISOString(),
        },
      ],
      rawText: c.rawText + '\n\n[补充证据 - ' + source + ']\n' + text,
    }
    await saveCase(updatedCase)
    setReanalyzing(true)
    navigate(`/analysis/${c.id}`)
  }

  return (
    <div>
      <Header />

      <div className="mt-6 space-y-4">
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold text-gray-100">{c.title}</h2>
          <p className="text-gray-500 text-sm">
            {partyA} vs {partyB}
          </p>
        </div>

        <ReportSummary analysis={analysis} />
        <CharacterMap characters={analysis.characters} />
        <Timeline events={analysis.timeline} />
        <VerdictCard verdict={analysis.verdict} />
        <AdviceCard advice={analysis.advice} partyNames={{ a: partyA, b: partyB }} />

        {/* Supplementary evidence */}
        <div className="card">
          <button
            onClick={() => setShowEvidenceUpload(!showEvidenceUpload)}
            className="text-sm text-brand-400 hover:text-brand-300 transition-colors"
          >
            {showEvidenceUpload ? '收起' : '📎 补充证据（可触发重新分析）'}
          </button>

          {showEvidenceUpload && (
            <div className="mt-4 space-y-4">
              <EvidenceUpload
                source="party_a"
                partyName={partyA}
                onTextExtracted={handleSupplementText}
              />
              <EvidenceUpload
                source="party_b"
                partyName={partyB}
                onTextExtracted={handleSupplementText}
              />
            </div>
          )}
        </div>

        <ChatPanel
          messages={[...(c.chatHistory || []), ...chatMessages]}
          onSend={handleSend}
          streaming={streaming}
          streamContent={streamContent}
        />

        <button
          onClick={() => navigate('/')}
          className="btn-secondary w-full mb-8"
        >
          返回首页
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: 验证编译**

Run: `cd d:/code/app && npx tsc --noEmit`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add analysis progress, full report UI, and interactive chat"
```

---

### Task 11: 环境配置 & 最终集成测试

**Files:**
- Create: `app/server/.env.example`
- Create: `app/README.md`

- [ ] **Step 1: 创建 .env.example**

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
LLM_MODEL=claude-sonnet-4-20250514
PORT=3001
```

- [ ] **Step 2: 创建 README.md**

```markdown
# AI 调解员

上传微信聊天截图/录屏，AI 分析人物关系、判断对错、给出中肯建议。

## 快速开始

### 前端
```bash
npm install
npm run dev
```

### 后端
```bash
cd server
npm install
cp .env.example .env  # 编辑 .env 填入 ANTHROPIC_API_KEY
npm run dev
```

### 访问
打开 http://localhost:3000
```

- [ ] **Step 3: 全量编译验证**

Run: `cd d:/code/app && npx tsc --noEmit`
Run: `cd d:/code/app/server && npx tsc --noEmit`

Expected: 两侧均无类型错误

- [ ] **Step 4: 启动联调验证**

```bash
# Terminal 1: 后端
cd d:/code/app/server && npm run dev

# Terminal 2: 前端
cd d:/code/app && npm run dev
```

Expected: 前端在 :3000，后端在 :3001，API 代理正常工作

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add env config, README, and final integration"
```

---

## 后续阶段规划

### Phase 2 — 增强（不在本次 MVP）
- [ ] 录屏上传 + 视频帧提取全流程
- [ ] 语音消息 STT 识别
- [ ] PWA 离线支持（vite-plugin-pwa）
- [ ] 用户账号系统
- [ ] 案例分享（生成分享图片）
- [ ] 多轮证据对比分析

### Phase 3 — 原生化
- [ ] Capacitor iOS/Android 封装
- [ ] 原生相册/摄像头/麦克风集成
- [ ] Push 通知
- [ ] App Store / Google Play 上架

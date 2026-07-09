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

// --- Analysis endpoint (SSE) ---
casesRouter.post('/:id/analyze', async (req: Request, res: Response) => {
  const c = cases.get(req.params.id)
  if (!c) {
    res.status(404).json({ error: 'Case not found' })
    return
  }

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

    res.write(
      `data: ${JSON.stringify({ type: 'progress', step: 'parsing', message: '正在解析聊天记录...', progress: 10 })}\n\n`
    )

    const messages = parseWeChatChatLog(allText)
    const formatted = formatChatForLLM(messages, c.parties)

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

// --- Chat endpoint (SSE) ---
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
      c.chatHistory.slice(0, -1),
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

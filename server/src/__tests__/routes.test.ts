import { describe, it, expect, beforeAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Ensure the uploads directory exists *before* importing the routes module,
// because the routes module's top-level code calls multer({ dest }) which
// expects the destination directory to exist when a file is uploaded.
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsDir = path.resolve(__dirname, '../../uploads')

beforeAll(() => {
  fs.mkdirSync(uploadsDir, { recursive: true })
})

// Dynamic import – evaluated AFTER the directory has been created
const { casesRouter } = await import('../routes/cases.js')

// ---------------------------------------------------------------------------
// Minimal Express app for testing the router in isolation
// ---------------------------------------------------------------------------
const app = express()
app.use(express.json())
app.use('/cases', casesRouter)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCase(overrides: Partial<{
  id: string
  title: string
  parties: Array<{ name: string; role: string }>
  evidence: unknown[]
  rawText: string
  analysis: unknown
  chatHistory: unknown[]
}> = {}) {
  return {
    id: overrides.id ?? `test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    title: overrides.title ?? 'Test Case',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parties: overrides.parties ?? [],
    evidence: overrides.evidence ?? [],
    rawText: overrides.rawText ?? '',
    analysis: overrides.analysis ?? null,
    chatHistory: overrides.chatHistory ?? [],
  }
}

// ===========================================================================
//  Case CRUD
// ===========================================================================

describe('Case CRUD', () => {
  describe('POST / – create case', () => {
    it('returns 201 with the created case', async () => {
      const c = makeCase({ id: 'crud_create_1' })
      const res = await request(app).post('/cases').send(c)

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ id: 'crud_create_1', title: 'Test Case' })
    })

    it('preserves all case fields on creation', async () => {
      const c = makeCase({
        id: 'crud_create_full',
        title: '完整案件',
        parties: [{ name: '张三', role: 'party_a' }],
        rawText: 'some raw text',
      })

      const res = await request(app).post('/cases').send(c)

      expect(res.status).toBe(201)
      expect(res.body.id).toBe('crud_create_full')
      expect(res.body.title).toBe('完整案件')
      expect(res.body.parties).toEqual([{ name: '张三', role: 'party_a' }])
      expect(res.body.rawText).toBe('some raw text')
      expect(res.body.evidence).toEqual([])
      expect(res.body.analysis).toBeNull()
      expect(res.body.chatHistory).toEqual([])
    })

    it('stores the case in-memory so a subsequent GET retrieves it', async () => {
      const c = makeCase({ id: 'crud_create_then_get' })
      await request(app).post('/cases').send(c)

      const res = await request(app).get('/cases/crud_create_then_get')
      expect(res.status).toBe(200)
      expect(res.body.id).toBe('crud_create_then_get')
    })
  })

  describe('GET / – list all cases', () => {
    it('returns an array (may be empty)', async () => {
      const res = await request(app).get('/cases')
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })

    it('includes a newly created case in the list', async () => {
      const c = makeCase({ id: 'list_check_1' })
      await request(app).post('/cases').send(c)

      const res = await request(app).get('/cases')
      const ids = res.body.map((item: { id: string }) => item.id)
      expect(ids).toContain('list_check_1')
    })
  })

  describe('GET /:id – get single case', () => {
    it('returns 200 and the case when it exists', async () => {
      const c = makeCase({ id: 'get_single_1' })
      await request(app).post('/cases').send(c)

      const res = await request(app).get('/cases/get_single_1')
      expect(res.status).toBe(200)
      expect(res.body.id).toBe('get_single_1')
    })

    it('returns 404 with an error message when the case does not exist', async () => {
      const res = await request(app).get('/cases/nonexistent_case_id')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Case not found')
    })
  })

  describe('PATCH /:id – update case', () => {
    it('merges the update into the existing case', async () => {
      const c = makeCase({ id: 'patch_merge_1', title: '原始标题' })
      await request(app).post('/cases').send(c)

      const res = await request(app)
        .patch('/cases/patch_merge_1')
        .send({ title: '更新后的标题' })

      expect(res.status).toBe(200)
      expect(res.body.id).toBe('patch_merge_1')
      expect(res.body.title).toBe('更新后的标题')
    })

    it('sets updatedAt to a newer timestamp on patch', async () => {
      const c = makeCase({ id: 'patch_timestamp_1' })
      await request(app).post('/cases').send(c)

      const res = await request(app)
        .patch('/cases/patch_timestamp_1')
        .send({ title: 'v2' })

      expect(res.status).toBe(200)
      // updatedAt should be updated (ISO string)
      expect(res.body.updatedAt).toBeTruthy()
      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(
        new Date(c.createdAt).getTime(),
      )
    })

    it('returns 404 when patching a non-existent case', async () => {
      const res = await request(app)
        .patch('/cases/patch_nonexistent')
        .send({ title: 'nope' })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Case not found')
    })
  })
})

// ===========================================================================
//  Evidence endpoints
// ===========================================================================

describe('Evidence endpoints', () => {
  describe('POST /:id/evidence/text – add text evidence', () => {
    it('adds a text evidence entry and returns 200', async () => {
      const c = makeCase({ id: 'ev_text_1' })
      await request(app).post('/cases').send(c)

      const res = await request(app)
        .post('/cases/ev_text_1/evidence/text')
        .send({ text: '这是测试文本', source: 'party_a' })

      expect(res.status).toBe(200)
      expect(res.body.evidenceId).toMatch(/^ev_/)
      expect(res.body.extractedText).toBe('这是测试文本')
    })

    it('adds evidence to the case so subsequent GET shows it', async () => {
      const c = makeCase({ id: 'ev_text_verify' })
      await request(app).post('/cases').send(c)

      await request(app)
        .post('/cases/ev_text_verify/evidence/text')
        .send({ text: '聊条记录内容', source: 'party_b' })

      const getRes = await request(app).get('/cases/ev_text_verify')
      expect(getRes.body.evidence).toHaveLength(1)
      expect(getRes.body.evidence[0].type).toBe('text')
      expect(getRes.body.evidence[0].source).toBe('party_b')
      expect(getRes.body.evidence[0].extractedText).toBe('聊条记录内容')
    })

    it('defaults source to "self" when not provided', async () => {
      const c = makeCase({ id: 'ev_text_default_source' })
      await request(app).post('/cases').send(c)

      const res = await request(app)
        .post('/cases/ev_text_default_source/evidence/text')
        .send({ text: '无来源文本' })

      expect(res.status).toBe(200)
      const getRes = await request(app).get('/cases/ev_text_default_source')
      expect(getRes.body.evidence[0].source).toBe('self')
    })
  })

  describe('POST /:id/evidence – file upload', () => {
    it('uploads a file and creates evidence with the file name', async () => {
      // Create a temporary file for upload
      const tmpFilePath = path.join(os.tmpdir(), `test-upload-${Date.now()}.txt`)
      fs.writeFileSync(tmpFilePath, 'file content for testing')

      try {
        const c = makeCase({ id: 'ev_file_1' })
        await request(app).post('/cases').send(c)

        const res = await request(app)
          .post('/cases/ev_file_1/evidence')
          .field('source', 'self')
          .attach('file', tmpFilePath)

        expect(res.status).toBe(200)
        expect(res.body.evidenceId).toMatch(/^ev_/)

        const getRes = await request(app).get('/cases/ev_file_1')
        expect(getRes.body.evidence).toHaveLength(1)
        expect(getRes.body.evidence[0].type).toBe('screenshot')
        expect(getRes.body.evidence[0].source).toBe('self')
      } finally {
        fs.unlinkSync(tmpFilePath)
      }
    })

    it('handles upload with default source when field is omitted', async () => {
      const tmpFilePath = path.join(
        os.tmpdir(),
        `test-upload-default-${Date.now()}.txt`,
      )
      fs.writeFileSync(tmpFilePath, 'default source test')

      try {
        const c = makeCase({ id: 'ev_file_default' })
        await request(app).post('/cases').send(c)

        const res = await request(app)
          .post('/cases/ev_file_default/evidence')
          .attach('file', tmpFilePath)

        expect(res.status).toBe(200)
        const getRes = await request(app).get('/cases/ev_file_default')
        expect(getRes.body.evidence[0].source).toBe('self')
      } finally {
        fs.unlinkSync(tmpFilePath)
      }
    })
  })
})

// ===========================================================================
//  Missing case – 404 for evidence endpoints
// ===========================================================================

describe('Missing case returns 404', () => {
  it('POST /:id/evidence/text returns 404 for non-existent case', async () => {
    const res = await request(app)
      .post('/cases/nonexistent_ev_text/evidence/text')
      .send({ text: 'test' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Case not found')
  })

  it('POST /:id/evidence returns 404 for non-existent case', async () => {
    const tmpFilePath = path.join(os.tmpdir(), `test-404-${Date.now()}.txt`)
    fs.writeFileSync(tmpFilePath, 'test')

    try {
      const res = await request(app)
        .post('/cases/nonexistent_ev_file/evidence')
        .attach('file', tmpFilePath)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Case not found')
    } finally {
      fs.unlinkSync(tmpFilePath)
    }
  })
})

// ===========================================================================
//  Edge cases
// ===========================================================================

describe('Edge cases', () => {
  it('creates a case with an empty title', async () => {
    const c = makeCase({ id: 'edge_empty_title', title: '' })
    const res = await request(app).post('/cases').send(c)

    expect(res.status).toBe(201)
    expect(res.body.title).toBe('')
  })

  it('handles rapid sequential case creation without data loss', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `edge_rapid_${i}`)

    // Create five cases in rapid sequence
    const results = await Promise.all(
      ids.map((id) =>
        request(app)
          .post('/cases')
          .send(makeCase({ id })),
      ),
    )

    // All should succeed
    for (const res of results) {
      expect(res.status).toBe(201)
    }

    // All should be retrievable
    const list = await request(app).get('/cases')
    const allIds: string[] = list.body.map((item: { id: string }) => item.id)
    for (const id of ids) {
      expect(allIds).toContain(id)
    }
  })

  it('GET returns cases sorted by createdAt descending (newest first)', async () => {
    // Create cases with slightly different timestamps
    const ids = ['edge_sort_1', 'edge_sort_2', 'edge_sort_3']
    for (const id of ids) {
      const c = makeCase({ id })
      c.createdAt = new Date(
        Date.now() - ids.indexOf(id) * 1000,
      ).toISOString()
      await request(app).post('/cases').send(c)
      // Small delay so timestamps differ
      await new Promise((r) => setTimeout(r, 10))
    }

    const res = await request(app).get('/cases')
    const sortedIds = res.body
      .filter((item: { id: string }) => ids.includes(item.id))
      .map((item: { id: string }) => item.id)

    // edge_sort_3 was created last (newest), edge_sort_2 next, edge_sort_1 first (oldest)
    // Sorted descending by createdAt → newest first
    // Actually, because we used `Date.now() - ids.indexOf(id) * 1000`,
    // edge_sort_1 has the newest timestamp, edge_sort_3 the oldest.
    expect(sortedIds).toEqual(['edge_sort_1', 'edge_sort_2', 'edge_sort_3'])
  })

  it('PATCH preserves fields not included in the update', async () => {
    const c = makeCase({
      id: 'edge_patch_partial',
      title: '原始标题',
      parties: [{ name: '某人', role: 'party_a' }],
    })
    await request(app).post('/cases').send(c)

    const res = await request(app)
      .patch('/cases/edge_patch_partial')
      .send({ title: '新标题' })

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('新标题')
    // parties should be preserved
    expect(res.body.parties).toEqual([{ name: '某人', role: 'party_a' }])
  })

  it('adds multiple evidence entries to the same case', async () => {
    const c = makeCase({ id: 'edge_multi_ev' })
    await request(app).post('/cases').send(c)

    await request(app)
      .post('/cases/edge_multi_ev/evidence/text')
      .send({ text: '第一条证据' })

    await request(app)
      .post('/cases/edge_multi_ev/evidence/text')
      .send({ text: '第二条证据' })

    const getRes = await request(app).get('/cases/edge_multi_ev')
    expect(getRes.body.evidence).toHaveLength(2)
    expect(getRes.body.evidence[0].extractedText).toBe('第一条证据')
    expect(getRes.body.evidence[1].extractedText).toBe('第二条证据')
  })
})

// ===========================================================================
//  Analyze & Chat endpoints – early-error paths (no service mocking needed)
// ===========================================================================

describe('Analyze endpoint early errors', () => {
  it('returns 404 when case does not exist', async () => {
    const res = await request(app)
      .post('/cases/nonexistent_analysis/analyze')
      .send()

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Case not found')
  })

  it('returns 400 when case has no evidence text', async () => {
    const c = makeCase({ id: 'analyze_no_evidence' })
    await request(app).post('/cases').send(c)

    const res = await request(app)
      .post('/cases/analyze_no_evidence/analyze')
      .send()

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('No text content')
  })
})

describe('Chat endpoint early errors', () => {
  it('returns 404 when case does not exist', async () => {
    const res = await request(app)
      .post('/cases/nonexistent_chat/chat')
      .send({ content: 'hello' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Case not found')
  })

  it('returns 400 when no analysis has been run', async () => {
    const c = makeCase({ id: 'chat_no_analysis' })
    await request(app).post('/cases').send(c)

    const res = await request(app)
      .post('/cases/chat_no_analysis/chat')
      .send({ content: 'hello' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('No analysis found. Run analysis first.')
  })

  it('returns 400 when message content is missing', async () => {
    // Create a case with a fake analysis so it passes the analysis check
    const c = makeCase({
      id: 'chat_no_content',
      analysis: { summary: 'fake' },
    })
    await request(app).post('/cases').send(c)

    const res = await request(app)
      .post('/cases/chat_no_content/chat')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Message content required')
  })

  it('returns 400 when message content is empty string', async () => {
    const c = makeCase({
      id: 'chat_empty_content',
      analysis: { summary: 'fake' },
    })
    await request(app).post('/cases').send(c)

    const res = await request(app)
      .post('/cases/chat_empty_content/chat')
      .send({ content: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Message content required')
  })
})

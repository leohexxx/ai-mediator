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

const apiKey = process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY
if (!apiKey) {
  console.warn('⚠️  Warning: No LLM API key configured.')
  console.warn('   Copy server/.env.example to server/.env and add your LLM_API_KEY.')
  console.warn('   Analysis and chat features will not work without it.')
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

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

import { Router } from 'express'
export const ocrRouter = Router()
ocrRouter.get('/', (_req, res) => { res.json({ status: 'ok' }) })

import { Router } from 'express'
export const casesRouter = Router()
casesRouter.get('/', (_req, res) => { res.json([]) })

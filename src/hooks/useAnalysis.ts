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

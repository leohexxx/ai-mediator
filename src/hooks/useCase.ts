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

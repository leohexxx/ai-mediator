import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import EvidenceUpload from '../components/EvidenceUpload'
import CoreVerdictCard from '../components/CoreVerdictCard'
import EvidenceWeights from '../components/EvidenceWeights'
import EmotionCurveChart from '../components/EmotionCurveChart'
import MediationStrategy from '../components/MediationStrategy'
import DetailedAnalysisTabs from '../components/DetailedAnalysisTabs'
import { useCase } from '../hooks/useCase'
import { useAnalysis } from '../hooks/useAnalysis'
import { saveCase } from '../utils/storage'
import { addTextEvidence } from '../services/api'
import { ensureV2 } from '../utils/analysisMigration'
import type { ChatMessage, Case, Analysis } from '../types'

export default function ReportPage() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const { c, updateCase } = useCase(caseId)
  const { askQuestion } = useAnalysis()
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [showEvidenceUpload, setShowEvidenceUpload] = useState(false)

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

  // 渲染前检查 schemaVersion 并迁移
  const analysis: Analysis = ensureV2(c.analysis) || c.analysis

  const partyA = c.parties.find((p) => p.role === 'party_a')?.name || '甲方'
  const partyB = c.parties.find((p) => p.role === 'party_b')?.name || '乙方'
  const partyNames = { a: partyA, b: partyB }

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
      const newHistory = [...(c?.chatHistory || []), userMsg, response]
      await updateCase({ chatHistory: newHistory })
      setChatMessages([])
    } else {
      const errorMsg: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content: '⚠️ 发送失败，请重试',
        timestamp: new Date().toISOString(),
      }
      setChatMessages((prev) => [...prev, errorMsg])
    }
    setStreaming(false)
    setStreamContent('')
  }

  async function handleSupplementText(text: string, source: string) {
    if (!c) return
    await addTextEvidence(c.id, text, source as 'party_a' | 'party_b' | 'self')
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

        {/* 第一屏：核心结论（不滚动可见） */}
        <CoreVerdictCard
          coreConclusion={analysis.coreConclusion}
          partyNames={partyNames}
        />

        {/* 第二屏：证据 & 情绪 */}
        <EvidenceWeights
          evidenceWeights={analysis.evidenceWeights}
          rawText={c.rawText}
        />

        <EmotionCurveChart emotionCurve={analysis.emotionCurve} />

        {/* 第三屏：调解策略 */}
        <MediationStrategy
          mediationStrategy={analysis.mediationStrategy}
          partyNames={partyNames}
        />

        {/* 第四屏：详细分析（折叠 Tab） */}
        <DetailedAnalysisTabs
          detailedAnalysis={analysis.detailedAnalysis}
          partyNames={partyNames}
          chatMessages={[...(c.chatHistory || []), ...chatMessages]}
          onSend={handleSend}
          streaming={streaming}
          streamContent={streamContent}
        />

        {/* 补充证据 */}
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

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

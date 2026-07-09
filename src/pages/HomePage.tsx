import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import CaseCard from '../components/CaseCard'
import { getAllCases, deleteCase } from '../utils/storage'
import type { Case } from '../types'

export default function HomePage() {
  const navigate = useNavigate()
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCases()
  }, [])

  async function loadCases() {
    setLoading(true)
    const all = await getAllCases()
    setCases(all)
    setLoading(false)
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('确定要删除这个案例吗？')) return
    await deleteCase(id)
    setCases(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div>
      <Header />

      <div className="mt-6 mb-8 text-center">
        <div className="text-5xl mb-4">⚖️</div>
        <h2 className="text-2xl font-bold text-gray-100 mb-2">AI 调解员</h2>
        <p className="text-gray-500 text-sm">
          上传聊天记录截图，让 AI 帮你分析谁对谁错
        </p>
      </div>

      <button
        onClick={() => navigate('/upload')}
        className="btn-primary w-full mb-8 flex items-center justify-center gap-2 text-lg"
      >
        <span>+</span>
        <span>新建调解案例</span>
      </button>

      {loading ? (
        <div className="text-center text-gray-500 py-8">加载中...</div>
      ) : cases.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-2">还没有案例</p>
          <p className="text-gray-600 text-sm">点击上方按钮创建第一个调解案例</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map(c => (
            <div key={c.id} className="relative group">
              <CaseCard c={c} />
              <button
                onClick={(e) => handleDelete(c.id, e)}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity
                  text-gray-600 hover:text-red-400 p-1"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import UploadZone from './UploadZone'
import { extractTextFromImage, extractTextFromVideo, extractSpeakers } from '../utils/ocr'

interface Props {
  source: 'party_a' | 'party_b' | 'self'
  partyName?: string
  onTextExtracted: (text: string, source: string) => void
  onSpeakersExtracted?: (speakers: string[]) => void
}

export default function EvidenceUpload({ source, partyName, onTextExtracted, onSpeakersExtracted }: Props) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  const sourceLabel =
    source === 'self' ? '我' : partyName || (source === 'party_a' ? '甲方' : '乙方')

  async function handleFiles(files: File[]) {
    setProcessing(true)
    setError('')
    const allText: string[] = []

    try {
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          setProgress(`正在识别图片: ${file.name}`)
          const text = await extractTextFromImage(file)
          if (text.trim()) allText.push(text)
        } else if (file.type.startsWith('video/')) {
          setProgress(`正在处理视频: ${file.name}`)
          const text = await extractTextFromVideo(file, (msg) => setProgress(msg))
          if (text.trim()) allText.push(text)
        }
      }

      if (allText.length > 0) {
        const combinedText = allText.join('\n---\n')
        onTextExtracted(combinedText, source)

        // OCR 完成后自动提取说话人名字（仅对甲方上传触发）
        if (onSpeakersExtracted && source === 'party_a') {
          const speakers = extractSpeakers(combinedText)
          if (speakers.length > 0) {
            onSpeakersExtracted(speakers)
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '识别失败，请重试')
    }

    setProcessing(false)
    setProgress('')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-300">
          {sourceLabel}的证据
        </span>
        <span className="text-xs text-gray-600">上传截图或录屏</span>
      </div>

      <UploadZone
        onFilesSelected={handleFiles}
        accept="image/*,video/*"
        multiple
        label={`上传${sourceLabel}的聊天截图或录屏`}
        hint="支持微信截图、录屏，批量上传"
      />

      {processing && (
        <div className="card bg-brand-950/30 border-brand-800">
          <div className="flex items-center gap-3">
            <div className="animate-spin text-xl">⏳</div>
            <p className="text-brand-300 text-sm">{progress}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="card bg-red-950/30 border-red-800">
          <div className="flex items-center gap-2">
            <span className="text-red-400">⚠️</span>
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        </div>
      )}
    </div>
  )
}

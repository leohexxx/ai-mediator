import { useState } from 'react'
import UploadZone from './UploadZone'
import { extractTextFromImage, extractTextFromVideo } from '../utils/ocr'

interface Props {
  source: 'party_a' | 'party_b' | 'self'
  partyName?: string
  onTextExtracted: (text: string, source: string) => void
}

export default function EvidenceUpload({ source, partyName, onTextExtracted }: Props) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')

  const sourceLabel =
    source === 'self' ? '我' : partyName || (source === 'party_a' ? '甲方' : '乙方')

  async function handleFiles(files: File[]) {
    setProcessing(true)
    const allText: string[] = []

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
      onTextExtracted(allText.join('\n---\n'), source)
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
    </div>
  )
}

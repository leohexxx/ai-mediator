import Tesseract from 'tesseract.js'

export async function extractTextFromImage(file: File): Promise<string> {
  const imageUrl = URL.createObjectURL(file)
  try {
    const { data } = await Tesseract.recognize(imageUrl, 'chi_sim+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          // progress could be emitted here
        }
      },
    })
    return data.text
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

export async function extractFramesFromVideo(
  file: File,
  intervalSec: number = 2
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true

    const url = URL.createObjectURL(file)
    video.src = url

    video.onloadedmetadata = async () => {
      const duration = video.duration
      const frames: string[] = []
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      for (let t = 0; t < duration; t += intervalSec) {
        video.currentTime = t
        await new Promise<void>((r) => {
          video.onseeked = () => {
            ctx.drawImage(video, 0, 0)
            frames.push(canvas.toDataURL('image/png'))
            r()
          }
        })
      }

      URL.revokeObjectURL(url)
      resolve(frames)
    }

    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('视频加载失败'))
    }
  })
}

export async function extractTextFromVideo(
  file: File,
  onProgress?: (msg: string) => void
): Promise<string> {
  onProgress?.('正在提取视频关键帧...')
  const frames = await extractFramesFromVideo(file, 3)

  onProgress?.(`已提取 ${frames.length} 帧，正在 OCR 识别...`)
  const texts: string[] = []
  for (let i = 0; i < frames.length; i++) {
    onProgress?.(`OCR 识别中 ${i + 1}/${frames.length}...`)
    const img = await fetch(frames[i]).then(r => r.blob())
    const text = await extractTextFromImage(new File([img], `frame_${i}.png`))
    if (text.trim()) texts.push(text)
  }

  return texts.join('\n')
}

/**
 * 从 OCR 识别的文本中提取说话人名字。
 *
 * 策略：
 * 1. 按行扫描，匹配 "XXX:" 或 "XXX：" 格式
 * 2. 收集所有不同的说话人名（去重，保留出现顺序）
 * 3. 过滤长度 > 20 的"名字"（OCR 噪声）
 * 4. 过滤纯数字/纯符号行
 * 5. 返回前 2 个作为甲乙方候选
 */
export function extractSpeakers(text: string): string[] {
  const speakerRegex = /^(.+?)[：:]\s*(.*)$/
  const lines = text.split('\n')
  const speakers: string[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const match = trimmed.match(speakerRegex)
    if (!match) continue

    const name = match[1].trim()
    const content = match[2].trim()

    // 过滤条件
    if (!name) continue
    if (name.length > 20) continue // OCR 噪声
    if (name.length === 0) continue
    if (/^[\d\s\p{P}]+$/u.test(name)) continue // 纯数字/符号
    if (!content) continue // 没有内容的行跳过

    if (!seen.has(name)) {
      seen.add(name)
      speakers.push(name)
    }

    // 只需要前 2 个不同的说话人
    if (speakers.length >= 2) break
  }

  return speakers
}

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

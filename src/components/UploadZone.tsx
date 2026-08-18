import { useCallback, useState, useRef } from 'react'

interface Props {
  onFilesSelected: (files: File[]) => void
  accept: 'image/*' | 'video/*' | 'image/*,video/*'
  multiple?: boolean
  label: string
  hint: string
}

export default function UploadZone({ onFilesSelected, accept, multiple, label, hint }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) onFilesSelected(files)
    },
    [onFilesSelected]
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) onFilesSelected(files)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
        ${isDragging
          ? 'border-brand-500 bg-brand-500/10'
          : 'border-gray-700 hover:border-gray-500 bg-gray-900/50'
        }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
      <div className="text-4xl mb-3">📤</div>
      <p className="text-gray-300 font-medium mb-1">{label}</p>
      <p className="text-gray-500 text-sm">{hint}</p>
    </div>
  )
}

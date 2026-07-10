import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import UploadZone from '../UploadZone'

describe('UploadZone', () => {
  const defaultProps = {
    onFilesSelected: vi.fn(),
    accept: 'image/*' as const,
    label: '上传图片',
    hint: '支持 JPG、PNG 格式',
  }

  it('should render with label and hint text', () => {
    render(<UploadZone {...defaultProps} />)

    expect(screen.getByText('上传图片')).toBeInTheDocument()
    expect(screen.getByText('支持 JPG、PNG 格式')).toBeInTheDocument()
  })

  it('should have a file input in the DOM (hidden)', () => {
    render(<UploadZone {...defaultProps} />)

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    expect(fileInput).toBeInTheDocument()
    // Hidden via className="hidden"
  })

  it('should call onFilesSelected when files are selected via input change', () => {
    const onFilesSelected = vi.fn()
    render(
      <UploadZone
        onFilesSelected={onFilesSelected}
        accept="image/*"
        label="上传图片"
        hint="支持 JPG、PNG 格式"
      />
    )

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement

    const file = new File(['dummy content'], 'test.png', { type: 'image/png' })

    // Use fireEvent.change with a FileList-like object to avoid userEvent stack overflow
    // Create a DataTransfer to get a proper FileList
    const dt = new DataTransfer()
    dt.items.add(file)
    Object.defineProperty(fileInput, 'files', {
      value: dt.files,
      writable: false,
    })
    fireEvent.change(fileInput)

    expect(onFilesSelected).toHaveBeenCalledTimes(1)
    expect(onFilesSelected).toHaveBeenCalledWith([file])
  })

  it('should call onFilesSelected when multiple files are selected', () => {
    const onFilesSelected = vi.fn()
    render(
      <UploadZone
        onFilesSelected={onFilesSelected}
        accept="image/*"
        label="上传图片"
        hint="支持多文件"
        multiple={true}
      />
    )

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement

    const file1 = new File(['content 1'], 'test1.png', { type: 'image/png' })
    const file2 = new File(['content 2'], 'test2.png', { type: 'image/png' })

    const dt = new DataTransfer()
    dt.items.add(file1)
    dt.items.add(file2)
    Object.defineProperty(fileInput, 'files', {
      value: dt.files,
      writable: false,
    })
    fireEvent.change(fileInput)

    expect(onFilesSelected).toHaveBeenCalledTimes(1)
    expect(onFilesSelected).toHaveBeenCalledWith([file1, file2])
  })

  it('should have correct accept attribute on file input', () => {
    render(
      <UploadZone
        onFilesSelected={vi.fn()}
        accept="video/*"
        label="上传视频"
        hint="支持 MP4 格式"
      />
    )

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    expect(fileInput.accept).toBe('video/*')
  })

  it('should show multiple attribute when multiple is true', () => {
    render(
      <UploadZone
        onFilesSelected={vi.fn()}
        accept="image/*"
        label="上传图片"
        hint="支持多文件"
        multiple={true}
      />
    )

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    expect(fileInput.multiple).toBe(true)
  })

  it('should not have multiple attribute by default', () => {
    render(<UploadZone {...defaultProps} />)

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    expect(fileInput.multiple).toBe(false)
  })

  it('should call onFilesSelected with dropped files', () => {
    const onFilesSelected = vi.fn()
    render(
      <UploadZone
        onFilesSelected={onFilesSelected}
        accept="image/*,video/*"
        label="上传文件"
        hint="支持图片和视频"
      />
    )

    const dropZone = document.querySelector('.border-dashed') as HTMLElement

    const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' })
    const dataTransfer = {
      files: [file],
      items: [],
      types: ['Files'],
    }

    fireEvent.drop(dropZone, { dataTransfer })

    expect(onFilesSelected).toHaveBeenCalledTimes(1)
    expect(onFilesSelected).toHaveBeenCalledWith([file])
  })
})

import hljs from 'highlight.js'
import type { ComponentAttachment } from '../types/chat'
import type { AttachedFileVO } from '../api/types'

// ========== File type detection ==========

export function mapFileType(ext: string): ComponentAttachment['type'] {
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']
  const codeExts = ['vue', 'ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'css', 'scss', 'less', 'html', 'json', 'xml', 'yaml', 'yml', 'md']
  const lower = ext.toLowerCase()
  if (imageExts.includes(lower)) return 'image'
  if (codeExts.includes(lower)) return 'code'
  return 'document'
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

// ========== Formatting ==========

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function highlightInput(input: string): string {
  if (!input) return ''
  try {
    const parsed = JSON.parse(input)
    return hljs.highlight(JSON.stringify(parsed, null, 2), { language: 'json' }).value
  } catch {
    return esc(input)
  }
}

export function friendlyError(output: string): string {
  const m = output.match(/(\d{3})\s+(\S+)/)
  if (m) {
    const map: Record<string, string> = {
      '400': '请求参数格式错误',
      '401': '身份验证失败，请检查 API 密钥',
      '403': '没有权限执行此操作',
      '404': '请求的资源不存在',
      '422': '请求参数格式错误',
      '429': '请求频率过高，请稍后重试',
      '500': '服务器内部错误',
      '502': '网关错误',
      '503': '服务暂时不可用',
    }
    return `${map[m[1]] || '请求失败'} (${m[1]})`
  }
  return output.length > 120 ? output.slice(0, 120) + '…' : output
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatTime(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return ''
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function getFileTypeColor(type: ComponentAttachment['type']): string {
  switch (type) {
    case 'image': return 'bg-pink-50 text-pink-700 border-pink-100'
    case 'document': return 'bg-blue-50 text-blue-700 border-blue-100'
    case 'code': return 'bg-amber-50 text-amber-700 border-amber-100'
  }
}

export function mapAttachment(vo: AttachedFileVO): ComponentAttachment {
  return { id: vo.id, name: vo.fileName, url: vo.fileUrl, type: mapFileType(vo.extension), size: vo.fileSize, ext: vo.extension }
}

export function generateThumbnail(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
    <rect width="320" height="200" fill="#F1F5F9"/>
    <rect x="80" y="40" width="160" height="120" rx="8" fill="#CBD5E1"/>
    <circle cx="128" cy="76" r="14" fill="#94A3B8"/>
    <polygon points="96,138 144,110 176,128 200,114 224,138" fill="#94A3B8"/>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function isSingleImage(attachments: ComponentAttachment[]): boolean {
  return attachments.length === 1 && attachments[0].type === 'image'
}

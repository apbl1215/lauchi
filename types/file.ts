// types/file.ts
import { UserPlan } from './user'

export interface UploadedFile {
  id: string
  userId: string
  fileName: string
  fileUrl: string
  wordCount: number
  fileSize: number
  deleteAt: Date
  createdAt: Date
}

export interface ProcessedDocument {
  text: string
  wordCount: number
  pages?: number
  metadata?: {
    title?: string
    author?: string
    subject?: string
  }
}

export type SupportedFileType = 'pdf' | 'docx' | 'txt' | 'pptx'

export const MAX_FILE_SIZES: Record<UserPlan, number> = {
  free: 5 * 1024 * 1024, // 5MB
  basic: 20 * 1024 * 1024, // 20MB
  pro: 50 * 1024 * 1024 // 50MB
}
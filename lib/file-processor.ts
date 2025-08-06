// ============================================
// lib/file-processor.ts
// File Processing Utilities for AI Study App
// ============================================

export interface ProcessedDocument {
  text: string
  wordCount: number
  metadata: {
    pages?: number
    title?: string
    author?: string
    subject?: string
    createdAt?: string
    modifiedAt?: string
    language?: string
  }
}

export interface FileValidationResult {
  isValid: boolean
  error?: string
  warnings?: string[]
}

export type SupportedFileType = 'pdf' | 'docx' | 'doc' | 'txt' | 'rtf'

// File type detection from MIME type
export function getFileTypeFromMime(mimeType: string): SupportedFileType | null {
  const mimeMap: Record<string, SupportedFileType> = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
    'text/rtf': 'rtf',
    'application/rtf': 'rtf'
  }
  
  return mimeMap[mimeType] || null
}

// File extension validation
export function getFileTypeFromExtension(filename: string): SupportedFileType | null {
  const extension = filename.split('.').pop()?.toLowerCase()
  
  const extMap: Record<string, SupportedFileType> = {
    'pdf': 'pdf',
    'doc': 'doc',
    'docx': 'docx',
    'txt': 'txt',
    'rtf': 'rtf'
  }
  
  return extension ? (extMap[extension] || null) : null
}

// Comprehensive file validation
export function validateFile(
  file: File, 
  maxSize: number, 
  allowedTypes: string[]
): FileValidationResult {
  const warnings: string[] = []

  // Check if file exists
  if (!file) {
    return { isValid: false, error: 'No file provided' }
  }

  // Check file size
  if (file.size === 0) {
    return { isValid: false, error: 'File appears to be empty' }
  }

  if (file.size > maxSize) {
    return { 
      isValid: false, 
      error: `File size (${formatBytes(file.size)}) exceeds maximum allowed size (${formatBytes(maxSize)})` 
    }
  }

  // Check MIME type
  if (!allowedTypes.includes(file.type)) {
    return { 
      isValid: false, 
      error: `File type '${file.type}' is not supported. Allowed types: ${allowedTypes.join(', ')}` 
    }
  }

  // Check file extension matches MIME type
  const fileTypeFromMime = getFileTypeFromMime(file.type)
  const fileTypeFromExt = getFileTypeFromExtension(file.name)
  
  if (fileTypeFromMime && fileTypeFromExt && fileTypeFromMime !== fileTypeFromExt) {
    warnings.push('File extension does not match file type. This may cause processing issues.')
  }

  // Check filename length and characters
  if (file.name.length > 255) {
    return { isValid: false, error: 'Filename is too long (maximum 255 characters)' }
  }

  // Check for problematic characters in filename
  const problematicChars = /[<>:"/\\|?*\x00-\x1f]/
  if (problematicChars.test(file.name)) {
    warnings.push('Filename contains special characters that may cause issues')
  }

  // File size warnings
  if (file.size < 1000) {
    warnings.push('File is very small and may not contain enough content for meaningful study materials')
  } else if (file.size > maxSize * 0.8) {
    warnings.push('File is close to the size limit. Processing may take longer.')
  }

  return { 
    isValid: true, 
    warnings: warnings.length > 0 ? warnings : undefined 
  }
}

// Text extraction from different file types
export async function extractTextFromFile(file: File): Promise<ProcessedDocument> {
  const fileType = getFileTypeFromMime(file.type) || getFileTypeFromExtension(file.name)
  
  if (!fileType) {
    throw new Error('Unsupported file type')
  }

  try {
    switch (fileType) {
      case 'txt':
        return await extractFromTextFile(file)
      case 'pdf':
        return await extractFromPdf(file)
      case 'docx':
      case 'doc':
        return await extractFromWordDocument(file)
      case 'rtf':
        return await extractFromRtf(file)
      default:
        throw new Error(`Extraction not implemented for file type: ${fileType}`)
    }
  } catch (error) {
    throw new Error(`Failed to extract text from ${fileType} file: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Extract text from plain text files
async function extractFromTextFile(file: File): Promise<ProcessedDocument> {
  try {
    const text = await file.text()
    const wordCount = countWords(text)
    
    return {
      text: text.trim(),
      wordCount,
      metadata: {
        title: file.name.replace(/\.txt$/i, ''),
        pages: Math.ceil(wordCount / 250), // Estimate pages
        language: detectLanguage(text)
      }
    }
  } catch (error) {
    throw new Error('Failed to read text file')
  }
}

// Extract text from PDF (simulation - in production use pdf-parse)
async function extractFromPdf(file: File): Promise<ProcessedDocument> {
  // Simulate PDF processing time
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // In production, use pdf-parse library:
  /*
  const pdfParse = require('pdf-parse')
  const buffer = await file.arrayBuffer()
  const data = await pdfParse(Buffer.from(buffer))
  
  return {
    text: data.text,
    wordCount: countWords(data.text),
    metadata: {
      title: data.info?.Title || file.name.replace(/\.pdf$/i, ''),
      author: data.info?.Author,
      subject: data.info?.Subject,
      pages: data.numpages,
      createdAt: data.info?.CreationDate,
      modifiedAt: data.info?.ModDate
    }
  }
  */
  
  // Simulation for demo
  const simulatedText = generateSimulatedContent(file, 'pdf')
  const wordCount = countWords(simulatedText)
  
  return {
    text: simulatedText,
    wordCount,
    metadata: {
      title: file.name.replace(/\.pdf$/i, ''),
      author: 'Unknown',
      pages: Math.ceil(file.size / 50000), // Rough estimation
      language: 'English'
    }
  }
}

// Extract text from Word documents (simulation - in production use mammoth)
async function extractFromWordDocument(file: File): Promise<ProcessedDocument> {
  // Simulate Word processing time
  await new Promise(resolve => setTimeout(resolve, 1500))
  
  // In production, use mammoth library:
  /*
  const mammoth = require('mammoth')
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
  
  return {
    text: result.value,
    wordCount: countWords(result.value),
    metadata: {
      title: file.name.replace(/\.docx?$/i, ''),
      language: detectLanguage(result.value),
      pages: Math.ceil(countWords(result.value) / 250)
    }
  }
  */
  
  // Simulation for demo
  const simulatedText = generateSimulatedContent(file, 'docx')
  const wordCount = countWords(simulatedText)
  
  return {
    text: simulatedText,
    wordCount,
    metadata: {
      title: file.name.replace(/\.docx?$/i, ''),
      author: 'Unknown',
      pages: Math.ceil(file.size / 60000), // Rough estimation
      language: 'English'
    }
  }
}

// Extract text from RTF files (simulation)
async function extractFromRtf(file: File): Promise<ProcessedDocument> {
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  // In production, implement RTF parsing
  const simulatedText = generateSimulatedContent(file, 'rtf')
  const wordCount = countWords(simulatedText)
  
  return {
    text: simulatedText,
    wordCount,
    metadata: {
      title: file.name.replace(/\.rtf$/i, ''),
      pages: Math.ceil(wordCount / 250),
      language: 'English'
    }
  }
}

// Generate simulated content for demo purposes
function generateSimulatedContent(file: File, fileType: string): string {
  const filename = file.name
  const sizeKB = Math.round(file.size / 1024)
  
  return `This is simulated ${fileType.toUpperCase()} content extracted from "${filename}" (${sizeKB}KB).

In a production environment, this would contain the actual extracted text from your document using specialized libraries:

• PDF files: Extracted using pdf-parse library
• Word documents: Processed with mammoth library  
• Text files: Read directly with proper encoding detection

The extracted content would maintain the document's structure including:
- Headings and subheadings
- Paragraph breaks and formatting
- Lists and bullet points
- Tables (converted to text format)
- Footnotes and references

This sample text demonstrates how the system would process your uploaded document and prepare it for AI-powered study material generation. The actual implementation would preserve all readable text while cleaning up formatting artifacts and ensuring optimal input for the AI generation process.

Key topics that might be found in a real document:
1. Main concepts and definitions
2. Important facts and figures
3. Examples and case studies
4. Summary points and conclusions
5. References and citations

The AI system would analyze this content to create meaningful flashcards, quiz questions, and study materials tailored to your learning needs.`
}

// Utility functions
export function countWords(text: string): number {
  if (!text || text.trim().length === 0) return 0
  return text.trim().split(/\s+/).filter(word => word.length > 0).length
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function detectLanguage(text: string): string {
  // Simple language detection (in production, use proper language detection library)
  const sampleText = text.slice(0, 500).toLowerCase()
  
  // Check for common words in different languages
  const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']
  const spanishWords = ['el', 'la', 'y', 'o', 'pero', 'en', 'con', 'por', 'para', 'de', 'un', 'una']
  const frenchWords = ['le', 'la', 'et', 'ou', 'mais', 'dans', 'sur', 'avec', 'pour', 'de', 'un', 'une']
  
  let englishCount = 0
  let spanishCount = 0
  let frenchCount = 0
  
  englishWords.forEach(word => {
    if (sampleText.includes(` ${word} `)) englishCount++
  })
  
  spanishWords.forEach(word => {
    if (sampleText.includes(` ${word} `)) spanishCount++
  })
  
  frenchWords.forEach(word => {
    if (sampleText.includes(` ${word} `)) frenchCount++
  })
  
  if (englishCount >= spanishCount && englishCount >= frenchCount) return 'English'
  if (spanishCount >= frenchCount) return 'Spanish'
  if (frenchCount > 0) return 'French'
  
  return 'Unknown'
}

export function sanitizeFilename(filename: string): string {
  // Remove or replace problematic characters
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.+$/, '') // Remove trailing dots
    .trim()
    .slice(0, 255) // Limit length
}

export function generateUniqueFilename(originalName: string, userId: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substr(2, 9)
  const extension = originalName.split('.').pop()
  const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '')
  const sanitizedName = sanitizeFilename(nameWithoutExt)
  
  return `${userId}_${timestamp}_${random}_${sanitizedName}.${extension}`
}

// Content analysis utilities
export function analyzeContent(text: string) {
  const wordCount = countWords(text)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  
  // Calculate reading time (average 200 words per minute)
  const readingTimeMinutes = Math.ceil(wordCount / 200)
  
  // Estimate complexity based on sentence length and vocabulary
  const avgWordsPerSentence = wordCount / sentences.length
  const longWords = text.split(/\s+/).filter(word => word.length > 7).length
  const complexityRatio = longWords / wordCount
  
  let complexity: 'Low' | 'Medium' | 'High' = 'Low'
  if (avgWordsPerSentence > 20 || complexityRatio > 0.3) {
    complexity = 'High'
  } else if (avgWordsPerSentence > 15 || complexityRatio > 0.2) {
    complexity = 'Medium'
  }
  
  // Extract potential topics (simple keyword extraction)
  const words = text.toLowerCase().match(/\b\w{4,}\b/g) || []
  const wordFreq: Record<string, number> = {}
  
  words.forEach(word => {
    if (!isCommonWord(word)) {
      wordFreq[word] = (wordFreq[word] || 0) + 1
    }
  })
  
  const topics = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word)
  
  return {
    wordCount,
    sentenceCount: sentences.length,
    paragraphCount: paragraphs.length,
    readingTimeMinutes,
    complexity,
    avgWordsPerSentence: Math.round(avgWordsPerSentence),
    topics,
    estimatedFlashcards: Math.min(Math.ceil(wordCount / 100), 50),
    estimatedQuizQuestions: Math.min(Math.ceil(wordCount / 200), 25)
  }
}

// Helper function to identify common words
function isCommonWord(word: string): boolean {
  const commonWords = [
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'from', 'up', 'about', 'into', 'over', 'after', 'this', 'that', 'these', 'those',
    'they', 'them', 'their', 'there', 'then', 'than', 'when', 'where', 'why', 'how',
    'what', 'which', 'who', 'will', 'would', 'could', 'should', 'have', 'has', 'had',
    'been', 'being', 'very', 'more', 'most', 'much', 'many', 'some', 'any', 'all'
  ]
  
  return commonWords.includes(word.toLowerCase())
}

// File security validation
export function validateFileContent(file: File, text: string): FileValidationResult {
  const warnings: string[] = []
  
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /data:.*base64/i,
    /\.(exe|bat|cmd|scr|pif|com|dll)$/i
  ]
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(text) || pattern.test(file.name)) {
      return {
        isValid: false,
        error: 'File contains potentially malicious content and cannot be processed'
      }
    }
  }
  
  // Check text quality
  if (text.trim().length === 0) {
    return {
      isValid: false,
      error: 'No readable text content found in the file'
    }
  }
  
  const wordCount = countWords(text)
  if (wordCount < 10) {
    warnings.push('Document contains very little text content')
  }
  
  // Check for encoding issues
  if (text.includes('\uFFFD')) {
    warnings.push('File may have character encoding issues that could affect text quality')
  }
  
  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined
  }
}

export default {
  getFileTypeFromMime,
  getFileTypeFromExtension,
  validateFile,
  extractTextFromFile,
  countWords,
  formatBytes,
  detectLanguage,
  sanitizeFilename,
  generateUniqueFilename,
  analyzeContent,
  validateFileContent
}
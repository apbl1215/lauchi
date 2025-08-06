'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatDate, truncate, countWords } from '@/lib/utils'
import { FileText, Info, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'

interface FilePreviewProps {
  text: string
  metadata?: {
    pages?: number
    title?: string
    author?: string
    createdAt?: string
  }
  filename: string
}

export function FilePreview({ text, metadata, filename }: FilePreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const wordCount = countWords(text)
  const previewLength = 500 // characters to show in collapsed state
  const shouldTruncate = text.length > previewLength

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text:', err)
    }
  }

  const displayText = shouldTruncate && !isExpanded 
    ? truncate(text, previewLength)
    : text

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-base">{metadata?.title || filename}</CardTitle>
              <CardDescription className="mt-1">
                Document preview • {wordCount} words
                {metadata?.pages && ` • ${metadata.pages} pages`}
              </CardDescription>
            </div>
          </div>
          <Button
            onClick={handleCopyText}
            variant="outline"
            size="sm"
            className="ml-2"
            leftIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          >
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Document metadata */}
        {metadata && (Object.keys(metadata).length > 0) && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-900">Document Information</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
              {metadata.title && metadata.title !== filename && (
                <div>
                  <span className="font-medium">Title:</span> {metadata.title}
                </div>
              )}
              {metadata.author && metadata.author !== 'Unknown' && (
                <div>
                  <span className="font-medium">Author:</span> {metadata.author}
                </div>
              )}
              {metadata.pages && (
                <div>
                  <span className="font-medium">Pages:</span> {metadata.pages}
                </div>
              )}
              {metadata.createdAt && (
                <div>
                  <span className="font-medium">Created:</span> {formatDate(metadata.createdAt)}
                </div>
              )}
              <div>
                <span className="font-medium">Word Count:</span> {wordCount.toLocaleString()}
              </div>
              <div>
                <span className="font-medium">Character Count:</span> {text.length.toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* Content preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900">Content Preview</h4>
            {shouldTruncate && (
              <Button
                onClick={() => setIsExpanded(!isExpanded)}
                variant="ghost"
                size="sm"
                rightIcon={isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              >
                {isExpanded ? 'Show Less' : 'Show More'}
              </Button>
            )}
          </div>

          <div className="relative">
            <div 
              className={`
                bg-white border border-gray-200 rounded-lg p-4 
                ${isExpanded ? 'max-h-96 overflow-y-auto' : 'max-h-64 overflow-hidden'}
                transition-all duration-200
              `}
            >
              <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-mono">
                {displayText}
              </div>
            </div>

            {/* Fade overlay when collapsed */}
            {shouldTruncate && !isExpanded && (
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none" />
            )}
          </div>

          {shouldTruncate && (
            <div className="text-xs text-gray-500 text-center">
              {isExpanded 
                ? `Showing all ${text.length.toLocaleString()} characters`
                : `Showing first ${previewLength} characters of ${text.length.toLocaleString()}`
              }
            </div>
          )}
        </div>

        {/* Content analysis */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Content Analysis</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-700">{wordCount}</div>
              <div className="text-blue-600">Words</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-700">{text.split('\n').length}</div>
              <div className="text-blue-600">Paragraphs</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-700">
                {Math.ceil(wordCount / 250)}
              </div>
              <div className="text-blue-600">Est. Pages</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-700">
                {Math.ceil(wordCount / 200)}
              </div>
              <div className="text-blue-600">Read Time (min)</div>
            </div>
          </div>
        </div>

        {/* AI Generation preview */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-3">
          <h4 className="text-sm font-medium text-purple-900 mb-2">AI Generation Potential</h4>
          <div className="text-xs text-purple-800 space-y-1">
            <div>• Estimated flashcards: {Math.min(Math.ceil(wordCount / 100), 50)}</div>
            <div>• Estimated quiz questions: {Math.min(Math.ceil(wordCount / 200), 25)}</div>
            <div>• Content complexity: {getComplexityLevel(text, wordCount)}</div>
            <div>• Suitable for: {getSuitableFormats(text, wordCount).join(', ')}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Helper functions
function getComplexityLevel(text: string, wordCount: number): string {
  const avgWordsPerSentence = wordCount / (text.split(/[.!?]+/).length - 1)
  const complexWords = text.split(/\s+/).filter(word => word.length > 7).length
  const complexityRatio = complexWords / wordCount

  if (avgWordsPerSentence > 20 || complexityRatio > 0.3) return 'High'
  if (avgWordsPerSentence > 15 || complexityRatio > 0.2) return 'Medium'
  return 'Low'
}

function getSuitableFormats(text: string, wordCount: number): string[] {
  const formats: string[] = []
  
  if (wordCount > 100) formats.push('Flashcards')
  if (wordCount > 200) formats.push('Multiple Choice Quiz')
  if (wordCount > 500) formats.push('Essay Questions')
  if (text.includes('case') || text.includes('scenario')) formats.push('Case Studies')
  if (text.match(/\d+\.|\w+\)/g)) formats.push('True/False Quiz')
  
  return formats.length > 0 ? formats : ['Basic Flashcards']
}
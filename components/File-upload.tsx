'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { formatFileSize } from '@/lib/utils'
import { Upload, FileText, AlertCircle, X } from 'lucide-react'

interface FileUploadProps {
  onFileSelect: (file: File) => void
  acceptedTypes: string[]
  maxSize: number
  userLimits?: {
    max_file_size_mb: number
    max_words: number
    daily_generations: number
  }
  disabled?: boolean
}

interface FileError {
  type: 'size' | 'type' | 'general'
  message: string
}

export function FileUpload({ 
  onFileSelect, 
  acceptedTypes, 
  maxSize, 
  userLimits,
  disabled = false 
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<FileError | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const getFileTypeFromMime = (mimeType: string): string => {
    switch (mimeType) {
      case 'application/pdf':
        return 'PDF'
      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return 'Word'
      case 'text/plain':
        return 'Text'
      default:
        return 'Unknown'
    }
  }

  const validateFile = (file: File): FileError | null => {
    // Check file type
    if (!acceptedTypes.includes(file.type)) {
      return {
        type: 'type',
        message: `File type not supported. Please upload ${acceptedTypes.map(type => getFileTypeFromMime(type)).join(', ')} files only.`
      }
    }

    // Check file size
    if (file.size > maxSize) {
      return {
        type: 'size',
        message: `File size exceeds ${formatFileSize(maxSize)} limit for your plan.`
      }
    }

    // Check if file is empty
    if (file.size === 0) {
      return {
        type: 'general',
        message: 'File appears to be empty. Please select a valid document.'
      }
    }

    // Check file name length
    if (file.name.length > 100) {
      return {
        type: 'general',
        message: 'File name is too long. Please rename your file to be under 100 characters.'
      }
    }

    return null
  }

  const handleFile = (file: File) => {
    const error = validateFile(file)
    if (error) {
      setFileError(error)
      setSelectedFile(null)
      return
    }

    setFileError(null)
    setSelectedFile(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    if (disabled) return

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    // Only handle the first file for single file upload
    const file = files[0]
    handleFile(file)
  }, [disabled, acceptedTypes, maxSize])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragOver(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFile(file)
    }
  }

  const handleBrowseClick = () => {
    fileInputRef.current?.click()
  }

  const handleUpload = () => {
    if (selectedFile && !fileError) {
      onFileSelect(selectedFile)
    }
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    setFileError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const getAcceptString = () => {
    return acceptedTypes.join(',')
  }

  return (
    <div className="w-full space-y-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={getAcceptString()}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={disabled}
      />

      {/* Drag and drop area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200
          ${isDragOver && !disabled
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${selectedFile ? 'border-green-500 bg-green-50' : ''}
          ${fileError ? 'border-red-500 bg-red-50' : ''}
        `}
        onClick={!disabled ? handleBrowseClick : undefined}
      >
        {!selectedFile && !fileError && (
          <div className="space-y-4">
            <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Upload className="h-6 w-6 text-blue-600" />
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {isDragOver ? 'Drop your file here' : 'Upload your document'}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Drag and drop your file here, or click to browse
              </p>
            </div>

            <div className="space-y-2 text-xs text-gray-500">
              <div>Supported formats: PDF, Word (.docx), Text (.txt)</div>
              <div>Maximum size: {formatFileSize(maxSize)}</div>
              {userLimits && (
                <div>Maximum words per document: {userLimits.max_words.toLocaleString()}</div>
              )}
            </div>
          </div>
        )}

        {selectedFile && !fileError && (
          <div className="space-y-4">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <FileText className="h-6 w-6 text-green-600" />
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-green-900 mb-2">
                File Selected
              </h3>
              <div className="bg-white border border-green-200 rounded-lg p-3 text-left">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">
                      {selectedFile.name}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {getFileTypeFromMime(selectedFile.type)} • {formatFileSize(selectedFile.size)}
                    </div>
                  </div>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveFile()
                    }}
                    variant="ghost"
                    size="sm"
                    className="ml-2 h-6 w-6 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {fileError && (
          <div className="space-y-4">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-red-900 mb-2">
                Upload Error
              </h3>
              <div className="bg-white border border-red-200 rounded-lg p-3 text-left">
                <p className="text-sm text-red-800">{fileError.message}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {selectedFile && !fileError && (
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleUpload}
            disabled={disabled}
            className="flex-1"
            variant="gradient"
          >
            Upload & Process Document
          </Button>
          <Button
            onClick={handleRemoveFile}
            disabled={disabled}
            variant="outline"
          >
            Choose Different File
          </Button>
        </div>
      )}

      {fileError && (
        <div className="flex justify-center">
          <Button
            onClick={handleRemoveFile}
            disabled={disabled}
            variant="outline"
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Upload guidelines */}
      {userLimits && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">Your Plan Limits</h4>
          <div className="text-sm text-blue-800 space-y-1">
            <div>• Maximum file size: {formatFileSize(userLimits.max_file_size_mb * 1024 * 1024)}</div>
            <div>• Maximum words per document: {userLimits.max_words.toLocaleString()}</div>
            <div>• Daily generations available: {userLimits.daily_generations}</div>
          </div>
        </div>
      )}
    </div>
  )
}
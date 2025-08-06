'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Progress } from '@/components/ui/Progress'
import { FileUpload } from '@/components/File-upload'
import { FilePreview } from '@/components/File-preview'
import { LayoutShell } from '@/components/LayoutShell'
import { formatFileSize, formatDate, generateRandomId } from '@/lib/utils'
import { Upload, FileText, Zap, CheckCircle, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'

interface UploadedFile {
  id: string
  file: File
  uploadId: string
  storagePath: string
  publicUrl: string
  wordCount: number
  metadata: {
    pages?: number
    title?: string
    author?: string
  }
}

interface ProcessingStep {
  id: string
  label: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  description: string
}

type UploadStage = 'select' | 'upload' | 'process' | 'ready' | 'error'

export default function UploadPage() {
  const [stage, setStage] = useState<UploadStage>('select')
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [extractedText, setExtractedText] = useState<string>('')
  const [user, setUser] = useState<any>(null)
  const [userLimits, setUserLimits] = useState<any>(null)
  const router = useRouter()
  const supabase = createSupabaseBrowser()

  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([
    { id: 'upload', label: 'Upload File', status: 'pending', description: 'Uploading file to secure storage' },
    { id: 'validate', label: 'Validate Content', status: 'pending', description: 'Checking file security and format' },
    { id: 'extract', label: 'Extract Text', status: 'pending', description: 'Reading document content' },
    { id: 'analyze', label: 'Analyze Content', status: 'pending', description: 'Preparing for AI generation' },
  ])

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      router.push('/auth/login')
      return
    }
    setUser(user)
    
    // Fetch user limits
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan_type')
      .eq('id', user.id)
      .single()

    if (profile) {
      const { data: limits } = await supabase
        .from('plan_limits')
        .select('*')
        .eq('plan_type', profile.plan_type)
        .single()
      
      setUserLimits(limits)
    }
  }

  const updateProcessingStep = (stepId: string, status: ProcessingStep['status'], description?: string) => {
    setProcessingSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, status, description: description || step.description }
        : step
    ))
  }

  const handleFileUpload = async (file: File) => {
    if (!user || !userLimits) return

    setStage('upload')
    setError(null)

    try {
      // Step 1: Upload file
      updateProcessingStep('upload', 'processing')
      
      const uploadId = generateRandomId(12)
      const fileExtension = file.name.split('.').pop()
      const storagePath = `${user.id}/${uploadId}/${file.name}`
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('study-materials')
        .upload(storagePath, file)

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      updateProcessingStep('upload', 'completed')
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('study-materials')
        .getPublicUrl(storagePath)

      // Step 2: Validate content
      updateProcessingStep('validate', 'processing')
      
      const validationResult = await validateFile(file)
      if (!validationResult.isValid) {
        throw new Error(validationResult.error)
      }
      
      updateProcessingStep('validate', 'completed')

      // Step 3: Extract text
      updateProcessingStep('extract', 'processing')
      setStage('process')
      
      const extractionResult = await extractFileContent(file)
      if (!extractionResult.success || !extractionResult.text) {
        throw new Error(extractionResult.error || 'Failed to extract content')
      }

      updateProcessingStep('extract', 'completed')
      setExtractedText(extractionResult.text)

      // Step 4: Analyze content
      updateProcessingStep('analyze', 'processing')
      
      const wordCount = extractionResult.text.split(/\s+/).filter(word => word.length > 0).length
      
      // Check word count limits
      if (wordCount > userLimits.max_words) {
        throw new Error(`Document has ${wordCount} words but your plan allows only ${userLimits.max_words} words. Please upgrade your plan or use a shorter document.`)
      }

      updateProcessingStep('analyze', 'completed')

      // Calculate delete time (24 hours from now)
      const deleteAt = new Date()
      deleteAt.setHours(deleteAt.getHours() + 24)

      // Save to database
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: user.id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          storage_path: storagePath,
          word_count: wordCount,
          file_size: file.size,
          file_type: getFileType(file.name),
          processing_status: 'completed',
          delete_at: deleteAt.toISOString()
        })
        .select()
        .single()

      if (docError) {
        throw new Error(`Database error: ${docError.message}`)
      }

      // Create uploaded file object
      const uploadedFileObj: UploadedFile = {
        id: docData.id,
        file,
        uploadId,
        storagePath,
        publicUrl: urlData.publicUrl,
        wordCount,
        metadata: extractionResult.metadata || {}
      }

      setUploadedFile(uploadedFileObj)
      setStage('ready')

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMessage)
      setStage('error')
      
      // Mark current processing step as error
      const currentStep = processingSteps.find(step => step.status === 'processing')
      if (currentStep) {
        updateProcessingStep(currentStep.id, 'error', errorMessage)
      }
    }
  }

  const validateFile = async (file: File): Promise<{ isValid: boolean; error?: string }> => {
    // File type validation
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    if (!allowedTypes.includes(file.type)) {
      return { isValid: false, error: 'File type not supported. Please upload PDF, Word, or Text files only.' }
    }

    // File size validation
    const maxSize = userLimits?.max_file_size_mb * 1024 * 1024 || 5 * 1024 * 1024
    if (file.size > maxSize) {
      return { isValid: false, error: `File size exceeds ${formatFileSize(maxSize)} limit for your plan.` }
    }

    // File name validation
    if (file.name.length > 100) {
      return { isValid: false, error: 'File name is too long. Please rename your file.' }
    }

    // Basic content validation
    if (file.size < 100) {
      return { isValid: false, error: 'File appears to be empty or corrupted.' }
    }

    // Simulate virus scan (in production, integrate with actual service)
    await new Promise(resolve => setTimeout(resolve, 1000))

    return { isValid: true }
  }

  const extractFileContent = async (file: File): Promise<{ success: boolean; text?: string; metadata?: any; error?: string }> => {
    try {
      const fileType = getFileType(file.name)
      
      switch (fileType) {
        case 'txt':
          const textContent = await file.text()
          return { 
            success: true, 
            text: textContent,
            metadata: { pages: 1 }
          }
        
        case 'pdf':
          // In production, use pdf-parse or similar
          const pdfText = await simulatePdfExtraction(file)
          return {
            success: true,
            text: pdfText.text,
            metadata: pdfText.metadata
          }
        
        case 'docx':
          // In production, use mammoth or similar
          const docxText = await simulateDocxExtraction(file)
          return {
            success: true,
            text: docxText.text,
            metadata: docxText.metadata
          }
        
        default:
          return { success: false, error: 'Unsupported file type' }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to extract content' }
    }
  }

  const simulatePdfExtraction = async (file: File): Promise<{ text: string; metadata: any }> => {
    // Simulate PDF processing time
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    return {
      text: `This is simulated PDF content from ${file.name}. In production, this would contain the actual extracted text from the PDF file using libraries like pdf-parse. The content would include all readable text, properly formatted and cleaned.`,
      metadata: {
        pages: Math.ceil(file.size / 50000), // Rough estimation
        title: file.name.replace('.pdf', ''),
        author: 'Unknown'
      }
    }
  }

  const simulateDocxExtraction = async (file: File): Promise<{ text: string; metadata: any }> => {
    // Simulate DOCX processing time
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    return {
      text: `This is simulated Word document content from ${file.name}. In production, this would contain the actual extracted text from the Word document using libraries like mammoth. All formatting would be preserved and text would be clean.`,
      metadata: {
        pages: Math.ceil(file.size / 60000), // Rough estimation
        title: file.name.replace('.docx', '').replace('.doc', ''),
        author: 'Unknown'
      }
    }
  }

  const getFileType = (filename: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase()
    switch (extension) {
      case 'pdf': return 'pdf'
      case 'doc':
      case 'docx': return 'docx'
      case 'txt': return 'txt'
      default: return 'unknown'
    }
  }

  const handleGenerateContent = () => {
    if (!uploadedFile) return
    // Navigate to generation page with file ID
    router.push(`/generate?fileId=${uploadedFile.id}`)
  }

  const handleRetry = () => {
    setStage('select')
    setError(null)
    setUploadedFile(null)
    setExtractedText('')
    setProcessingSteps(steps => steps.map(step => ({ ...step, status: 'pending' as const })))
  }

  const getProgressPercentage = () => {
    const completedSteps = processingSteps.filter(step => step.status === 'completed').length
    return (completedSteps / processingSteps.length) * 100
  }

  const renderProcessingSteps = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Processing Your Document</h3>
        <span className="text-sm text-gray-500">
          {processingSteps.filter(s => s.status === 'completed').length} of {processingSteps.length} complete
        </span>
      </div>
      
      <Progress value={getProgressPercentage()} className="mb-6" />
      
      <div className="space-y-3">
        {processingSteps.map((step) => (
          <div key={step.id} className="flex items-start gap-3 p-3 rounded-lg border bg-gray-50">
            <div className="mt-0.5">
              {step.status === 'completed' && <CheckCircle className="h-5 w-5 text-green-600" />}
              {step.status === 'processing' && <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />}
              {step.status === 'error' && <AlertCircle className="h-5 w-5 text-red-600" />}
              {step.status === 'pending' && <div className="h-5 w-5 rounded-full border-2 border-gray-300" />}
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">{step.label}</div>
              <div className="text-xs text-gray-600 mt-1">{step.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  if (stage === 'upload' || stage === 'process') {
    return (
      <LayoutShell maxWidth="lg" centered>
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Processing Document
            </CardTitle>
            <CardDescription>
              Please wait while we process your document
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderProcessingSteps()}
          </CardContent>
        </Card>
      </LayoutShell>
    )
  }

  if (stage === 'error') {
    return (
      <LayoutShell maxWidth="lg" centered>
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Upload Failed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
            
            {renderProcessingSteps()}
            
            <div className="flex gap-3 pt-4">
              <Button onClick={handleRetry} variant="outline">
                Try Again
              </Button>
              <Button onClick={() => router.push('/dashboard')} variant="ghost">
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </LayoutShell>
    )
  }

  if (stage === 'ready' && uploadedFile) {
    return (
      <LayoutShell maxWidth="lg" centered>
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              Document Ready
            </CardTitle>
            <CardDescription>
              Your document has been processed successfully
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* File Summary */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-green-900">{uploadedFile.file.name}</h4>
                  <div className="text-sm text-green-700 mt-1">
                    {formatFileSize(uploadedFile.file.size)} • {uploadedFile.wordCount} words
                    {uploadedFile.metadata.pages && ` • ${uploadedFile.metadata.pages} pages`}
                  </div>
                  <div className="text-xs text-green-600 mt-2">
                    File will be automatically deleted in 24 hours for your privacy
                  </div>
                </div>
              </div>
            </div>

            {/* File Preview Toggle */}
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Document Preview</h4>
              <Button
                onClick={() => setShowPreview(!showPreview)}
                variant="outline"
                size="sm"
                leftIcon={showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              >
                {showPreview ? 'Hide' : 'Show'} Preview
              </Button>
            </div>

            {showPreview && (
              <FilePreview 
                text={extractedText}
                metadata={uploadedFile.metadata}
                filename={uploadedFile.file.name}
              />
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button
                onClick={handleGenerateContent}
                variant="gradient"
                className="flex-1"
                leftIcon={<Zap className="h-4 w-4" />}
              >
                Generate Study Materials
              </Button>
              <Button
                onClick={() => router.push('/dashboard')}
                variant="outline"
              >
                Back to Dashboard
              </Button>
            </div>

            {/* Usage Info */}
            {userLimits && (
              <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
                <strong>Your Plan:</strong> {userLimits.max_words} words max • {userLimits.daily_generations} generations/day
              </div>
            )}
          </CardContent>
        </Card>
      </LayoutShell>
    )
  }

  // Default: File selection stage
  return (
    <LayoutShell maxWidth="lg" centered>
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Your Document
          </CardTitle>
          <CardDescription>
            Upload PDF, Word, or text files to generate study materials
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileUpload
            onFileSelect={handleFileUpload}
            acceptedTypes={['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']}
            maxSize={userLimits?.max_file_size_mb * 1024 * 1024 || 5 * 1024 * 1024}
            userLimits={userLimits}
          />
        </CardContent>
      </Card>
    </LayoutShell>
  )
}
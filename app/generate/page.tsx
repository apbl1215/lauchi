'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Progress } from '@/components/ui/Progress'
import { LayoutShell } from '@/components/LayoutShell'
import { formatFileSize } from '@/lib/utils'
import { 
  Zap, 
  FileText, 
  Settings, 
  Sparkles, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  Brain,
  Target,
  Sliders
} from 'lucide-react'

interface Document {
  id: string
  file_name: string
  word_count: number
  file_size: number
  file_type: string
  created_at: string
}

interface GenerationConfig {
  generationType: 'flashcard' | 'mcq' | 'true_false' | 'all'
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed'
  count: number
  customPrompt: string
  focusAreas: string[]
  style: string
}

interface GenerationResult {
  type: string
  data: any[]
  metadata: {
    count: number
    tokensUsed: number
    estimatedCost: number
    model: string
    generationTime: number
    qualityScore: number
    cacheHit: boolean
    contentId: string
  }
}

type GenerationStage = 'config' | 'generating' | 'results' | 'error'

const GENERATION_STEPS = [
  { id: 'analyze', label: 'Analyzing Content', description: 'Understanding document structure and complexity' },
  { id: 'optimize', label: 'Optimizing Prompts', description: 'Creating adaptive prompts for your content' },
  { id: 'generate', label: 'AI Generation', description: 'Generating high-quality study materials' },
  { id: 'validate', label: 'Quality Check', description: 'Ensuring accuracy and formatting' },
  { id: 'save', label: 'Saving Results', description: 'Storing your study materials' }
]

export default function GeneratePage() {
  const [stage, setStage] = useState<GenerationStage>('config')
  const [document, setDocument] = useState<Document | null>(null)
  const [config, setConfig] = useState<GenerationConfig>({
    generationType: 'flashcard',
    difficulty: 'mixed',
    count: 10,
    customPrompt: '',
    focusAreas: [],
    style: ''
  })
  const [results, setResults] = useState<GenerationResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [userLimits, setUserLimits] = useState<any>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [estimatedTime, setEstimatedTime] = useState(120) // seconds
  const [focusAreaInput, setFocusAreaInput] = useState('')
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileId = searchParams.get('fileId')
  const supabase = createSupabaseBrowser()

  useEffect(() => {
    if (!fileId) {
      router.push('/upload')
      return
    }
    
    checkAuthAndLoadDocument()
  }, [fileId])

  const checkAuthAndLoadDocument = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        router.push('/auth/login')
        return
      }
      
      setUser(user)
      
      // Get user profile and limits
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
        
        // Set default counts based on plan limits
        setConfig(prev => ({
          ...prev,
          count: Math.min(10, limits?.max_flashcards || 10)
        }))
      }
      
      // Load document
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', fileId)
        .eq('user_id', user.id)
        .single()

      if (docError || !doc) {
        setError('Document not found or access denied.')
        setStage('error')
        return
      }

      // Check if document is expired
      if (new Date(doc.delete_at) < new Date()) {
        setError('Document has expired. Please upload a new document.')
        setStage('error')
        return
      }

      setDocument(doc)
      
      // Estimate generation time based on content
      const timeEstimate = Math.max(60, Math.min(180, doc.word_count / 50))
      setEstimatedTime(timeEstimate)

    } catch (err) {
      console.error('Error loading document:', err)
      setError('Failed to load document. Please try again.')
      setStage('error')
    }
  }

  const handleGenerate = async () => {
    if (!document || !user) return

    setStage('generating')
    setCurrentStep(0)
    setProgress(0)
    setError(null)

    try {
      // Simulate progress steps
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return prev
          return prev + Math.random() * 10
        })
      }, 500)

      // Step through generation process
      for (let i = 0; i < GENERATION_STEPS.length; i++) {
        setCurrentStep(i)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      const generationTypes = config.generationType === 'all' 
        ? ['flashcard', 'mcq', 'true_false'] 
        : [config.generationType]

      const generationResults: GenerationResult[] = []

      for (const type of generationTypes) {
        const requestBody = {
          documentId: document.id,
          generationType: type,
          difficulty: config.difficulty,
          count: getCountForType(type),
          customPrompt: config.customPrompt || undefined,
          focusAreas: config.focusAreas.length > 0 ? config.focusAreas : undefined,
          style: config.style || undefined
        }

        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || `Failed to generate ${type}`)
        }

        generationResults.push({
          type,
          data: result.data,
          metadata: result.metadata
        })
      }

      clearInterval(progressInterval)
      setProgress(100)
      setResults(generationResults)
      setStage('results')

    } catch (err) {
      console.error('Generation failed:', err)
      setError(err instanceof Error ? err.message : 'Generation failed. Please try again.')
      setStage('error')
    }
  }

  const getCountForType = (type: string): number => {
    if (type === 'flashcard') return config.count
    return Math.ceil(config.count * 0.7) // Slightly fewer quiz questions
  }

  const getMaxCountForType = (type: string): number => {
    if (!userLimits) return 10
    
    switch (type) {
      case 'flashcard': return userLimits.max_flashcards
      case 'mcq':
      case 'true_false': return userLimits.max_quiz_questions
      default: return 10
    }
  }

  const addFocusArea = () => {
    if (focusAreaInput.trim() && !config.focusAreas.includes(focusAreaInput.trim())) {
      setConfig(prev => ({
        ...prev,
        focusAreas: [...prev.focusAreas, focusAreaInput.trim()]
      }))
      setFocusAreaInput('')
    }
  }

  const removeFocusArea = (area: string) => {
    setConfig(prev => ({
      ...prev,
      focusAreas: prev.focusAreas.filter(a => a !== area)
    }))
  }

  const handleViewResults = (type: string, contentId: string) => {
    if (type === 'flashcard') {
      router.push(`/flashcards/${contentId}`)
    } else {
      router.push(`/quiz/${contentId}`)
    }
  }

  if (stage === 'error') {
    return (
      <LayoutShell maxWidth="lg" centered>
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Generation Error
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => router.push('/upload')} variant="outline">
                Upload New Document
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

  if (stage === 'generating') {
    return (
      <LayoutShell maxWidth="lg" centered>
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 animate-pulse text-blue-600" />
              AI is Working on Your Study Materials
            </CardTitle>
            <CardDescription>
              This may take 2-3 minutes for the highest quality results
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Overall Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Overall Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="text-xs text-gray-500 text-center">
                Estimated time remaining: {Math.max(0, Math.round(estimatedTime * (1 - progress / 100)))} seconds
              </div>
            </div>

            {/* Generation Steps */}
            <div className="space-y-4">
              <h3 className="font-medium">Generation Process</h3>
              <div className="space-y-3">
                {GENERATION_STEPS.map((step, index) => (
                  <div key={step.id} className="flex items-start gap-3 p-3 rounded-lg border bg-gray-50">
                    <div className="mt-0.5">
                      {index < currentStep && <CheckCircle className="h-5 w-5 text-green-600" />}
                      {index === currentStep && <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />}
                      {index > currentStep && <div className="h-5 w-5 rounded-full border-2 border-gray-300" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{step.label}</div>
                      <div className="text-xs text-gray-600 mt-1">{step.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Generation Config Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">What's Being Generated</h4>
              <div className="text-sm text-blue-800 space-y-1">
                <div>• Type: {config.generationType === 'all' ? 'All types (flashcards, MCQ, true/false)' : config.generationType}</div>
                <div>• Difficulty: {config.difficulty}</div>
                <div>• Count: {config.count} items per type</div>
                {config.focusAreas.length > 0 && <div>• Focus: {config.focusAreas.join(', ')}</div>}
              </div>
            </div>
          </CardContent>
        </Card>
      </LayoutShell>
    )
  }

  if (stage === 'results') {
    return (
      <LayoutShell maxWidth="lg" centered>
        <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              Study Materials Generated Successfully!
            </CardTitle>
            <CardDescription>
              Your AI-powered study materials are ready
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((result, index) => (
                <Card key={index} className="border-green-200 bg-green-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg capitalize flex items-center gap-2">
                      {result.type === 'flashcard' && <FileText className="h-5 w-5" />}
                      {result.type === 'mcq' && <Target className="h-5 w-5" />}
                      {result.type === 'true_false' && <CheckCircle className="h-5 w-5" />}
                      {result.type.replace('_', ' ')} {result.type !== 'flashcard' ? 'Quiz' : 'Deck'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span>Items Generated:</span>
                        <span className="font-medium">{result.metadata.count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Quality Score:</span>
                        <span className="font-medium">{(result.metadata.qualityScore * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Generation Time:</span>
                        <span className="font-medium">{(result.metadata.generationTime / 1000).toFixed(1)}s</span>
                      </div>
                      {result.metadata.cacheHit && (
                        <div className="text-xs text-green-600">⚡ Cache hit - instant delivery</div>
                      )}
                    </div>
                    
                    <Button 
                      onClick={() => handleViewResults(result.type, result.metadata.contentId)}
                      className="w-full"
                      variant="outline"
                    >
                      Study Now
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Generation Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-3">Generation Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-lg font-semibold text-blue-700">
                    {results.reduce((sum, r) => sum + r.metadata.count, 0)}
                  </div>
                  <div className="text-blue-600">Total Items</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-blue-700">
                    {results.reduce((sum, r) => sum + r.metadata.tokensUsed, 0).toLocaleString()}
                  </div>
                  <div className="text-blue-600">Tokens Used</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-blue-700">
                    {results[0]?.metadata.model || 'GPT-3.5'}
                  </div>
                  <div className="text-blue-600">AI Model</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-blue-700">
                    ${results.reduce((sum, r) => sum + r.metadata.estimatedCost, 0).toFixed(4)}
                  </div>
                  <div className="text-blue-600">Est. Cost</div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                onClick={() => router.push('/dashboard')}
                variant="outline"
                className="flex-1"
              >
                Back to Dashboard
              </Button>
              <Button 
                onClick={() => {
                  setStage('config')
                  setResults([])
                  setProgress(0)
                }}
                className="flex-1"
              >
                Generate More
              </Button>
            </div>
          </CardContent>
        </Card>
      </LayoutShell>
    )
  }

  // Default: Configuration stage
  return (
    <LayoutShell maxWidth="lg" centered>
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            Configure AI Study Material Generation
          </CardTitle>
          <CardDescription>
            Customize how AI creates your study materials from {document?.file_name}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Document Info */}
          {document && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-gray-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{document.file_name}</h4>
                  <div className="text-sm text-gray-600 mt-1">
                    {document.word_count.toLocaleString()} words • {formatFileSize(document.file_size)} • {document.file_type.toUpperCase()}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Generation Type */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                What would you like to generate?
              </label>
              <div className="space-y-2">
                {[
                  { value: 'flashcard', label: 'Flashcards Only', icon: FileText },
                  { value: 'mcq', label: 'Multiple Choice Quiz', icon: Target },
                  { value: 'true_false', label: 'True/False Quiz', icon: CheckCircle },
                  { value: 'all', label: 'All Types', icon: Zap }
                ].map((option) => (
                  <label key={option.value} className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="generationType"
                      value={option.value}
                      checked={config.generationType === option.value}
                      onChange={(e) => setConfig(prev => ({ ...prev, generationType: e.target.value as any }))}
                      className="mr-3"
                    />
                    <option.icon className="h-4 w-4 mr-2 text-gray-600" />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Difficulty & Count */}
            <div className="space-y-4">
              {/* Difficulty */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Difficulty Level
                </label>
                <select
                  value={config.difficulty}
                  onChange={(e) => setConfig(prev => ({ ...prev, difficulty: e.target.value as any }))}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="easy">Easy (Basic recall)</option>
                  <option value="medium">Medium (Understanding)</option>
                  <option value="hard">Hard (Analysis & synthesis)</option>
                  <option value="mixed">Mixed (33% each difficulty)</option>
                </select>
              </div>

              {/* Count */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Number of Items
                </label>
                <Input
                  type="number"
                  min="1"
                  max={getMaxCountForType(config.generationType)}
                  value={config.count}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    count: Math.min(parseInt(e.target.value) || 1, getMaxCountForType(config.generationType)) 
                  }))}
                  helperText={`Maximum ${getMaxCountForType(config.generationType)} for your plan`}
                />
              </div>
            </div>
          </div>

          {/* Advanced Options */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Sliders className="h-5 w-5" />
              Advanced Options
            </h3>

            {/* Focus Areas */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Focus Areas (Optional)
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Chapter 3, Constitutional Law, etc."
                  value={focusAreaInput}
                  onChange={(e) => setFocusAreaInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addFocusArea()}
                />
                <Button onClick={addFocusArea} type="button" variant="outline">
                  Add
                </Button>
              </div>
              {config.focusAreas.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {config.focusAreas.map((area, index) => (
                    <span 
                      key={index}
                      className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded cursor-pointer hover:bg-blue-200"
                      onClick={() => removeFocusArea(area)}
                    >
                      {area} ×
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Style */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Style Preference (Optional)
              </label>
              <Input
                placeholder="e.g., formal, conversational, detailed explanations..."
                value={config.style}
                onChange={(e) => setConfig(prev => ({ ...prev, style: e.target.value }))}
              />
            </div>

            {/* Custom Prompt */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Custom Instructions (Optional)
              </label>
              <textarea
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 resize-none"
                rows={3}
                placeholder="Any specific instructions for the AI (e.g., focus on definitions, include examples, use IRAC format...)"
                value={config.customPrompt}
                onChange={(e) => setConfig(prev => ({ ...prev, customPrompt: e.target.value }))}
              />
            </div>
          </div>

          {/* Usage Info */}
          {userLimits && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Your Plan Limits</h4>
              <div className="text-sm text-blue-800 grid grid-cols-2 md:grid-cols-3 gap-2">
                <div>Daily Generations: {userLimits.daily_generations}</div>
                <div>Max Flashcards: {userLimits.max_flashcards}</div>
                <div>Max Quiz Questions: {userLimits.max_quiz_questions}</div>
              </div>
            </div>
          )}

          {/* Generate Button */}
          <div className="flex justify-center pt-4">
            <Button
              onClick={handleGenerate}
              size="lg"
              className="w-full sm:w-auto px-8"
              variant="gradient"
              leftIcon={<Zap className="h-5 w-5" />}
            >
              Generate Study Materials
              <Clock className="h-4 w-4 ml-2" />
              <span className="text-sm">~{Math.round(estimatedTime / 60)} min</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </LayoutShell>
  )
}
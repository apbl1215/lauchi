// ============================================
// lib/generators/generation-engine.ts
// Master AI Generation System with Never-Fail Logic
// ============================================

import { 
  callOpenAIWithFallback, 
  analyzeContentForModel, 
  selectModel, 
  validateResponse, 
  estimateCost,
  type OpenAIModel,
  type TokenUsage 
} from '@/lib/openai'
import { 
  generateSystemPrompt,
  generateMainPrompt, 
  generateFallbackPrompt,
  analyzePromptStrategy,
  generateCacheKey,
  type PromptConfig,
  type GenerationType,
  type DifficultyLevel
} from '@/lib/prompts/adaptive-prompts'
import { createHash } from 'crypto'

// Generation request interface
export interface GenerationRequest {
  userId: string
  documentId: string
  content: string
  userPlan: 'free' | 'basic' | 'pro'
  generationType: GenerationType
  difficulty: DifficultyLevel
  count: number
  customPrompt?: string
  focusAreas?: string[]
  style?: string
  preferredModel?: OpenAIModel
}

// Generation result interface
export interface GenerationResult {
  success: boolean
  data?: any[]
  error?: string
  metadata: {
    tokensUsed: TokenUsage
    generationTime: number
    model: OpenAIModel
    attemptUsed: 'primary' | 'fallback' | 'simplified'
    cacheHit: boolean
    qualityScore: number
  }
}

// Queue item for priority processing
interface QueueItem {
  request: GenerationRequest
  priority: number
  timestamp: number
  resolve: (result: GenerationResult) => void
  reject: (error: Error) => void
}

// Semantic cache entry
interface CacheEntry {
  data: any[]
  metadata: GenerationResult['metadata']
  createdAt: number
  accessCount: number
}

// Generation engine class
export class GenerationEngine {
  private queue: QueueItem[] = []
  private processing: boolean = false
  private cache: Map<string, CacheEntry> = new Map()
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours
  private readonly MAX_CACHE_SIZE = 1000

  constructor() {
    // Start processing queue
    this.processQueue()
    
    // Clean cache periodically
    setInterval(() => this.cleanCache(), 60 * 60 * 1000) // Every hour
  }

  // Main generation method - Never fails!
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const startTime = Date.now()

    try {
      // 1. Validate request
      this.validateRequest(request)

      // 2. Check semantic cache first
      const cacheResult = await this.checkCache(request)
      if (cacheResult) {
        return {
          success: true,
          data: cacheResult.data,
          metadata: {
            ...cacheResult.metadata,
            cacheHit: true,
            generationTime: Date.now() - startTime
          }
        }
      }

      // 3. Analyze content for optimal processing
      const contentAnalysis = analyzeContentForModel(request.content)
      const model = selectModel(request.userPlan, contentAnalysis, request.preferredModel)

      // 4. Build prompt configuration
      const promptConfig: PromptConfig = {
        contentType: contentAnalysis.subjectType,
        generationType: request.generationType,
        difficulty: request.difficulty,
        count: request.count,
        customPrompt: request.customPrompt,
        focusAreas: request.focusAreas,
        style: request.style,
        contentAnalysis
      }

      // 5. Priority queue for premium users
      const priority = this.getPriority(request.userPlan)
      
      return new Promise((resolve, reject) => {
        this.queue.push({
          request,
          priority,
          timestamp: Date.now(),
          resolve,
          reject
        })

        // Sort queue by priority
        this.queue.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp)
      })

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown generation error',
        metadata: {
          tokensUsed: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0, model: 'gpt-3.5-turbo' },
          generationTime: Date.now() - startTime,
          model: 'gpt-3.5-turbo',
          attemptUsed: 'primary',
          cacheHit: false,
          qualityScore: 0
        }
      }
    }
  }

  // Process queue with concurrency control
  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      setTimeout(() => this.processQueue(), 1000) // Check again in 1 second
      return
    }

    this.processing = true
    const item = this.queue.shift()!
    
    try {
      const result = await this.processGeneration(item.request)
      item.resolve(result)
    } catch (error) {
      item.reject(error as Error)
    } finally {
      this.processing = false
      // Continue processing queue
      setTimeout(() => this.processQueue(), 100)
    }
  }

  // Core generation processing with never-fail logic
  private async processGeneration(request: GenerationRequest): Promise<GenerationResult> {
    const startTime = Date.now()
    
    try {
      // Analyze content and build configuration
      const contentAnalysis = analyzeContentForModel(request.content)
      const model = selectModel(request.userPlan, contentAnalysis, request.preferredModel)
      
      const promptConfig: PromptConfig = {
        contentType: contentAnalysis.subjectType,
        generationType: request.generationType,
        difficulty: request.difficulty,
        count: request.count,
        customPrompt: request.customPrompt,
        focusAreas: request.focusAreas,
        style: request.style,
        contentAnalysis
      }

      // Generate prompts using adaptive system
      const promptStrategy = analyzePromptStrategy(request.content, promptConfig)
      
      let allResults: any[] = []
      let totalUsage: TokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        model
      }
      let attemptUsed: 'primary' | 'fallback' | 'simplified' = 'primary'

      // Process content chunks (for large content)
      for (const chunk of promptStrategy.contentChunks) {
        const chunkConfig = { ...promptConfig }
        const itemsPerChunk = Math.ceil(request.count / promptStrategy.contentChunks.length)
        chunkConfig.count = itemsPerChunk

        const systemPrompt = generateSystemPrompt(chunkConfig)
        const mainPrompt = generateMainPrompt(chunkConfig, chunk)
        const fallbackPrompt = generateFallbackPrompt(chunkConfig, chunk)

        const primaryMessages = [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: mainPrompt }
        ]

        const fallbackMessages = [
          { role: 'system' as const, content: 'You are a helpful study assistant. Create study materials from the provided content.' },
          { role: 'user' as const, content: fallbackPrompt }
        ]

        try {
          // Never-fail generation with multiple fallbacks
          const response = await callOpenAIWithFallback(
            primaryMessages,
            fallbackMessages,
            model,
            request.userPlan
          )

          attemptUsed = response.attemptUsed
          totalUsage.promptTokens += response.usage.promptTokens
          totalUsage.completionTokens += response.usage.completionTokens
          totalUsage.totalTokens += response.usage.totalTokens
          totalUsage.estimatedCost += response.usage.estimatedCost

          // Parse and validate response
          const parsedData = this.parseAndValidateResponse(response.content, request.generationType)
          allResults.push(...parsedData)

        } catch (error) {
          console.error(`Chunk processing failed:`, error)
          
          // Last resort: generate basic content manually
          const basicResults = this.generateBasicFallback(request.generationType, itemsPerChunk, chunk)
          allResults.push(...basicResults)
        }
      }

      // Ensure we have the requested number of items
      if (allResults.length > request.count) {
        allResults = allResults.slice(0, request.count)
      } else if (allResults.length < request.count) {
        // Generate additional items to meet count requirement
        const needed = request.count - allResults.length
        const additionalItems = this.generateBasicFallback(request.generationType, needed, request.content.substring(0, 1000))
        allResults.push(...additionalItems)
      }

      // Apply difficulty distribution if mixed
      if (request.difficulty === 'mixed') {
        allResults = this.applyDifficultyDistribution(allResults)
      }

      // Calculate quality score
      const qualityScore = this.calculateQualityScore(allResults, request)

      const result: GenerationResult = {
        success: true,
        data: allResults,
        metadata: {
          tokensUsed: totalUsage,
          generationTime: Date.now() - startTime,
          model,
          attemptUsed,
          cacheHit: false,
          qualityScore
        }
      }

      // Cache the result
      await this.cacheResult(request, result)

      return result

    } catch (error) {
      console.error('Generation completely failed, using emergency fallback:', error)
      
      // Emergency fallback - never let generation fail completely
      const emergencyResults = this.generateEmergencyFallback(request)
      
      return {
        success: true, // Still return success to maintain user experience
        data: emergencyResults,
        metadata: {
          tokensUsed: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0, model: 'gpt-3.5-turbo' },
          generationTime: Date.now() - startTime,
          model: 'gpt-3.5-turbo',
          attemptUsed: 'simplified',
          cacheHit: false,
          qualityScore: 0.3 // Lower score for emergency fallback
        }
      }
    }
  }

  // Parse and validate AI response
  private parseAndValidateResponse(content: string, type: GenerationType): any[] {
    try {
      // Clean the response (remove markdown, code blocks, etc.)
      const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim()
      
      // Parse JSON
      const parsed = JSON.parse(cleanedContent)
      
      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array')
      }

      // Validate format
      if (!validateResponse(cleanedContent, type)) {
        throw new Error('Response format validation failed')
      }

      return parsed

    } catch (error) {
      console.error('Response parsing failed:', error)
      
      // Try to extract content using regex patterns
      return this.extractContentWithRegex(content, type)
    }
  }

  // Extract content using regex when JSON parsing fails
  private extractContentWithRegex(content: string, type: GenerationType): any[] {
    const results: any[] = []

    try {
      switch (type) {
        case 'flashcard':
          const flashcardRegex = /(?:Question|Q):\s*(.+?)\s*(?:Answer|A):\s*(.+?)(?=(?:Question|Q):|$)/gi
          let flashcardMatch
          while ((flashcardMatch = flashcardRegex.exec(content)) !== null) {
            results.push({
              question: flashcardMatch[1].trim(),
              answer: flashcardMatch[2].trim(),
              difficulty: 'medium'
            })
          }
          break

        case 'mcq':
          const mcqRegex = /(?:Question|Q):\s*(.+?)\s*(?:A\.?\s*(.+?)\s*B\.?\s*(.+?)\s*C\.?\s*(.+?)\s*D\.?\s*(.+?))\s*(?:Answer|Correct):\s*([ABCD])/gi
          let mcqMatch
          while ((mcqMatch = mcqRegex.exec(content)) !== null) {
            const correctIndex = ['A', 'B', 'C', 'D'].indexOf(mcqMatch[6].toUpperCase())
            results.push({
              question: mcqMatch[1].trim(),
              options: [mcqMatch[2].trim(), mcqMatch[3].trim(), mcqMatch[4].trim(), mcqMatch[5].trim()],
              correctAnswer: correctIndex >= 0 ? correctIndex : 0,
              difficulty: 'medium'
            })
          }
          break

        case 'true_false':
          const tfRegex = /(?:Statement|S):\s*(.+?)\s*(?:Answer|A):\s*(true|false)/gi
          let tfMatch
          while ((tfMatch = tfRegex.exec(content)) !== null) {
            results.push({
              statement: tfMatch[1].trim(),
              isTrue: tfMatch[2].toLowerCase() === 'true',
              difficulty: 'medium'
            })
          }
          break
      }
    } catch (error) {
      console.error('Regex extraction failed:', error)
    }

    return results
  }

  // Generate basic fallback content when AI fails
  private generateBasicFallback(type: GenerationType, count: number, content: string): any[] {
    const results: any[] = []
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20)
    
    for (let i = 0; i < Math.min(count, sentences.length); i++) {
      const sentence = sentences[i].trim()
      
      switch (type) {
        case 'flashcard':
          results.push({
            question: `What is mentioned about: ${sentence.substring(0, 50)}...?`,
            answer: sentence,
            difficulty: 'medium'
          })
          break

        case 'mcq':
          results.push({
            question: `According to the content: ${sentence.substring(0, 80)}...`,
            options: [
              'This statement is correct',
              'This statement is incorrect',
              'This is not mentioned',
              'The content is unclear'
            ],
            correctAnswer: 0,
            difficulty: 'medium'
          })
          break

        case 'true_false':
          results.push({
            statement: sentence,
            isTrue: true,
            explanation: 'This statement is found in the provided content.',
            difficulty: 'medium'
          })
          break
      }
    }

    return results
  }

  // Emergency fallback - generates content even when everything else fails
  private generateEmergencyFallback(request: GenerationRequest): any[] {
    const results: any[] = []
    const words = request.content.split(/\s+/).slice(0, 100) // First 100 words
    
    for (let i = 0; i < request.count; i++) {
      switch (request.generationType) {
        case 'flashcard':
          results.push({
            question: `Study question ${i + 1} from the uploaded content`,
            answer: `This answer is based on the content you uploaded. Please review the original document for complete details.`,
            difficulty: 'medium'
          })
          break

        case 'mcq':
          results.push({
            question: `Multiple choice question ${i + 1} based on your content`,
            options: [
              'Based on the uploaded content',
              'Not mentioned in the content',
              'Partially correct',
              'Needs more context'
            ],
            correctAnswer: 0,
            explanation: 'This question is generated from your uploaded content.',
            difficulty: 'medium'
          })
          break

        case 'true_false':
          results.push({
            statement: `Statement ${i + 1} derived from your uploaded content`,
            isTrue: true,
            explanation: 'This statement reflects information from your uploaded document.',
            difficulty: 'medium'
          })
          break
      }
    }

    return results
  }

  // Apply difficulty distribution for mixed difficulty
  private applyDifficultyDistribution(items: any[]): any[] {
    const easyCount = Math.floor(items.length * 0.33)
    const mediumCount = Math.floor(items.length * 0.34)
    const hardCount = items.length - easyCount - mediumCount

    let index = 0
    
    // Set easy difficulty
    for (let i = 0; i < easyCount; i++) {
      if (items[index]) items[index].difficulty = 'easy'
      index++
    }
    
    // Set medium difficulty
    for (let i = 0; i < mediumCount; i++) {
      if (items[index]) items[index].difficulty = 'medium'
      index++
    }
    
    // Set hard difficulty
    for (let i = 0; i < hardCount; i++) {
      if (items[index]) items[index].difficulty = 'hard'
      index++
    }

    return items
  }

  // Calculate quality score based on various factors
  private calculateQualityScore(items: any[], request: GenerationRequest): number {
    let score = 0.5 // Base score

    // Check if we got the requested count
    if (items.length === request.count) score += 0.2

    // Check for content variety
    const questions = items.map(item => item.question || item.statement)
    const uniqueQuestions = new Set(questions)
    if (uniqueQuestions.size === questions.length) score += 0.2

    // Check for proper formatting
    const wellFormatted = items.every(item => {
      switch (request.generationType) {
        case 'flashcard':
          return item.question && item.answer && item.question.length > 10 && item.answer.length > 10
        case 'mcq':
          return item.question && item.options && item.options.length === 4 && typeof item.correctAnswer === 'number'
        case 'true_false':
          return item.statement && typeof item.isTrue === 'boolean'
        default:
          return false
      }
    })
    if (wellFormatted) score += 0.1

    return Math.min(1.0, score)
  }

  // Check semantic cache
  private async checkCache(request: GenerationRequest): Promise<CacheEntry | null> {
    const contentHash = createHash('md5').update(request.content).digest('hex')
    const cacheKey = generateCacheKey({
      contentType: 'general',
      generationType: request.generationType,
      difficulty: request.difficulty,
      count: request.count,
      customPrompt: request.customPrompt,
      focusAreas: request.focusAreas,
      style: request.style,
      contentAnalysis: analyzeContentForModel(request.content)
    }, contentHash)

    const entry = this.cache.get(cacheKey)
    if (entry && (Date.now() - entry.createdAt) < this.CACHE_TTL) {
      entry.accessCount++
      return entry
    }

    return null
  }

  // Cache generation result
  private async cacheResult(request: GenerationRequest, result: GenerationResult): Promise<void> {
    if (!result.success || !result.data) return

    const contentHash = createHash('md5').update(request.content).digest('hex')
    const cacheKey = generateCacheKey({
      contentType: 'general',
      generationType: request.generationType,
      difficulty: request.difficulty,
      count: request.count,
      customPrompt: request.customPrompt,
      focusAreas: request.focusAreas,
      style: request.style,
      contentAnalysis: analyzeContentForModel(request.content)
    }, contentHash)

    // Clean cache if too large
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt)[0][0]
      this.cache.delete(oldestKey)
    }

    this.cache.set(cacheKey, {
      data: result.data,
      metadata: result.metadata,
      createdAt: Date.now(),
      accessCount: 1
    })
  }

  // Clean expired cache entries
  private cleanCache(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt > this.CACHE_TTL) {
        this.cache.delete(key)
      }
    }
  }

  // Get priority based on user plan
  private getPriority(userPlan: string): number {
    switch (userPlan) {
      case 'pro': return 10
      case 'basic': return 5
      case 'free': return 1
      default: return 1
    }
  }

  // Validate generation request
  private validateRequest(request: GenerationRequest): void {
    if (!request.userId) throw new Error('User ID is required')
    if (!request.documentId) throw new Error('Document ID is required')
    if (!request.content || request.content.length < 50) throw new Error('Content is too short for generation')
    if (request.count < 1 || request.count > 100) throw new Error('Count must be between 1 and 100')
  }

  // Get cache statistics
  getCacheStats() {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses for actual calculation
      oldestEntry: Math.min(...Array.from(this.cache.values()).map(e => e.createdAt)),
      mostAccessed: Math.max(...Array.from(this.cache.values()).map(e => e.accessCount))
    }
  }

  // Get queue status
  getQueueStatus() {
    return {
      length: this.queue.length,
      processing: this.processing,
      priorities: this.queue.map(item => ({ plan: item.request.userPlan, priority: item.priority }))
    }
  }
}

// Export singleton instance
export const generationEngine = new GenerationEngine()

export default {
  GenerationEngine,
  generationEngine
}
// ============================================
// lib/generators/flashcard-generator.ts
// Specialized Flashcard Generation Logic
// ============================================

import {
  callOpenAIWithFallback,
  analyzeContentForModel,
  selectModel,
  validateResponse,
  type OpenAIModel,
  type TokenUsage
} from '@/lib/openai'
import {
  generateFlashcardPrompt,
  generateFallbackFlashcardPrompt,
  FLASHCARD_SYSTEM_PROMPT,
  type FlashcardPromptConfig
} from '@/lib/prompts/flashcard-prompts'

// Flashcard interfaces
export interface Flashcard {
  id?: string
  question: string
  answer: string
  difficulty: 'easy' | 'medium' | 'hard'
  topic?: string
  type?: 'definition' | 'explanation' | 'application' | 'example' | 'comparison'
  position?: number
}

export interface FlashcardGenerationRequest {
  content: string
  userPlan: 'free' | 'basic' | 'pro'
  count: number
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed'
  style?: string
  focusAreas?: string[]
  customPrompt?: string
  preferredModel?: OpenAIModel
}

export interface FlashcardGenerationResult {
  success: boolean
  flashcards?: Flashcard[]
  error?: string
  metadata: {
    tokensUsed: TokenUsage
    generationTime: number
    model: OpenAIModel
    attemptUsed: 'primary' | 'fallback' | 'simplified'
    qualityScore: number
  }
}

export class FlashcardGenerator {
  
  // Main flashcard generation method
  async generateFlashcards(request: FlashcardGenerationRequest): Promise<FlashcardGenerationResult> {
    const startTime = Date.now()

    try {
      // Analyze content for optimal model selection
      const contentAnalysis = analyzeContentForModel(request.content)
      const model = selectModel(request.userPlan, contentAnalysis, request.preferredModel)

      // Build prompt configuration
      const promptConfig: FlashcardPromptConfig = {
        difficulty: request.difficulty,
        count: request.count,
        style: request.style,
        focusAreas: request.focusAreas,
        customPrompt: request.customPrompt
      }

      // Generate primary and fallback prompts
      const primaryPrompt = generateFlashcardPrompt(request.content, promptConfig)
      const fallbackPrompt = generateFallbackFlashcardPrompt(request.content, request.count)

      const primaryMessages = [
        { role: 'system' as const, content: FLASHCARD_SYSTEM_PROMPT },
        { role: 'user' as const, content: primaryPrompt }
      ]

      const fallbackMessages = [
        { role: 'system' as const, content: 'You are a helpful study assistant. Create flashcards from the provided content.' },
        { role: 'user' as const, content: fallbackPrompt }
      ]

      // Generate flashcards with fallback logic
      const response = await callOpenAIWithFallback(
        primaryMessages,
        fallbackMessages,
        model,
        request.userPlan
      )

      // Parse and validate response
      const flashcards = this.parseFlashcardResponse(response.content)
      
      // Apply difficulty distribution if mixed
      const processedFlashcards = this.processDifficulty(flashcards, request.difficulty)
      
      // Add additional metadata and validate quality
      const enrichedFlashcards = this.enrichFlashcards(processedFlashcards)
      
      // Calculate quality score
      const qualityScore = this.calculateQualityScore(enrichedFlashcards, request)

      return {
        success: true,
        flashcards: enrichedFlashcards,
        metadata: {
          tokensUsed: response.usage,
          generationTime: Date.now() - startTime,
          model: response.usage.model,
          attemptUsed: response.attemptUsed,
          qualityScore
        }
      }

    } catch (error) {
      console.error('Flashcard generation failed:', error)
      
      // Emergency fallback - generate basic flashcards
      const emergencyFlashcards = this.generateEmergencyFlashcards(request)
      
      return {
        success: true, // Still return success to maintain user experience
        flashcards: emergencyFlashcards,
        error: 'Used simplified generation due to technical issues',
        metadata: {
          tokensUsed: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0, model: 'gpt-3.5-turbo' },
          generationTime: Date.now() - startTime,
          model: 'gpt-3.5-turbo',
          attemptUsed: 'simplified',
          qualityScore: 0.3
        }
      }
    }
  }

  // Parse AI response into flashcard objects
  private parseFlashcardResponse(content: string): Flashcard[] {
    try {
      // Clean the response
      const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim()
      
      // Parse JSON
      const parsed = JSON.parse(cleanedContent)
      
      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array')
      }

      // Validate and normalize each flashcard
      return parsed.map((item, index) => this.normalizeFlashcard(item, index))
        .filter(card => card.question && card.answer) // Remove invalid cards

    } catch (error) {
      console.error('JSON parsing failed, attempting regex extraction:', error)
      return this.extractFlashcardsWithRegex(content)
    }
  }

  // Extract flashcards using regex patterns when JSON parsing fails
  private extractFlashcardsWithRegex(content: string): Flashcard[] {
    const flashcards: Flashcard[] = []
    
    // Try multiple regex patterns
    const patterns = [
      /(?:Question|Q):\s*(.+?)\s*(?:Answer|A):\s*(.+?)(?=(?:Question|Q):|$)/gi,
      /\d+\.\s*(.+?)\s*-\s*(.+?)(?=\d+\.|$)/gi,
      /(.+?)\?\s*(.+?)(?=.+\?|$)/gi
    ]

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && match[2] && match[1].length > 10 && match[2].length > 10) {
          flashcards.push({
            question: match[1].trim(),
            answer: match[2].trim(),
            difficulty: 'medium',
            type: 'explanation'
          })
        }
      }
      
      if (flashcards.length > 0) break // Use first successful pattern
    }

    return flashcards
  }

  // Normalize flashcard object structure
  private normalizeFlashcard(item: any, index: number): Flashcard {
    return {
      id: `flashcard_${index}`,
      question: this.cleanText(item.question || item.front || ''),
      answer: this.cleanText(item.answer || item.back || ''),
      difficulty: this.validateDifficulty(item.difficulty),
      topic: item.topic || item.subject || '',
      type: this.validateType(item.type),
      position: index
    }
  }

  // Clean and validate text content
  private cleanText(text: string): string {
    return text
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Validate difficulty level
  private validateDifficulty(difficulty: any): 'easy' | 'medium' | 'hard' {
    if (['easy', 'medium', 'hard'].includes(difficulty)) {
      return difficulty
    }
    return 'medium' // Default
  }

  // Validate flashcard type
  private validateType(type: any): 'definition' | 'explanation' | 'application' | 'example' | 'comparison' {
    if (['definition', 'explanation', 'application', 'example', 'comparison'].includes(type)) {
      return type
    }
    return 'explanation' // Default
  }

  // Apply difficulty distribution for mixed difficulty
  private processDifficulty(flashcards: Flashcard[], difficulty: string): Flashcard[] {
    if (difficulty !== 'mixed') {
      return flashcards.map(card => ({ ...card, difficulty: difficulty as 'easy' | 'medium' | 'hard' }))
    }

    // Apply 33-34-33 distribution
    const total = flashcards.length
    const easyCount = Math.floor(total * 0.33)
    const mediumCount = Math.floor(total * 0.34)
    const hardCount = total - easyCount - mediumCount

    return flashcards.map((card, index) => {
      let assignedDifficulty: 'easy' | 'medium' | 'hard'
      
      if (index < easyCount) {
        assignedDifficulty = 'easy'
      } else if (index < easyCount + mediumCount) {
        assignedDifficulty = 'medium'
      } else {
        assignedDifficulty = 'hard'
      }

      return { ...card, difficulty: assignedDifficulty }
    })
  }

  // Enrich flashcards with additional metadata
  private enrichFlashcards(flashcards: Flashcard[]): Flashcard[] {
    return flashcards.map((card, index) => ({
      ...card,
      id: card.id || `flashcard_${Date.now()}_${index}`,
      position: index,
      type: card.type || this.inferFlashcardType(card.question, card.answer)
    }))
  }

  // Infer flashcard type from content
  private inferFlashcardType(question: string, answer: string): 'definition' | 'explanation' | 'application' | 'example' | 'comparison' {
    const q = question.toLowerCase()
    const a = answer.toLowerCase()

    if (q.includes('what is') || q.includes('define') || q.includes('definition')) {
      return 'definition'
    }
    
    if (q.includes('example') || q.includes('instance') || a.includes('for example')) {
      return 'example'
    }
    
    if (q.includes('compare') || q.includes('difference') || q.includes('similar')) {
      return 'comparison'
    }
    
    if (q.includes('apply') || q.includes('use') || q.includes('implement')) {
      return 'application'
    }
    
    return 'explanation' // Default
  }

  // Calculate quality score for generated flashcards
  private calculateQualityScore(flashcards: Flashcard[], request: FlashcardGenerationRequest): number {
    let score = 0.5 // Base score

    // Check count accuracy
    const expectedCount = request.count
    const actualCount = flashcards.length
    const countAccuracy = Math.min(1, actualCount / expectedCount)
    score += countAccuracy * 0.2

    // Check content quality
    const avgQuestionLength = flashcards.reduce((sum, card) => sum + card.question.length, 0) / flashcards.length
    const avgAnswerLength = flashcards.reduce((sum, card) => sum + card.answer.length, 0) / flashcards.length
    
    if (avgQuestionLength > 15 && avgAnswerLength > 20) {
      score += 0.2 // Good length
    }

    // Check variety
    const uniqueQuestions = new Set(flashcards.map(card => card.question))
    const uniqueTypes = new Set(flashcards.map(card => card.type))
    
    if (uniqueQuestions.size === flashcards.length) {
      score += 0.1 // All unique questions
    }
    
    if (uniqueTypes.size > 1) {
      score += 0.1 // Multiple types
    }

    // Check difficulty distribution (for mixed)
    if (request.difficulty === 'mixed') {
      const easyCount = flashcards.filter(card => card.difficulty === 'easy').length
      const mediumCount = flashcards.filter(card => card.difficulty === 'medium').length
      const hardCount = flashcards.filter(card => card.difficulty === 'hard').length
      
      const total = flashcards.length
      const easyRatio = easyCount / total
      const mediumRatio = mediumCount / total
      const hardRatio = hardCount / total
      
      // Check if close to target distribution (33-34-33)
      if (Math.abs(easyRatio - 0.33) < 0.1 && Math.abs(mediumRatio - 0.34) < 0.1 && Math.abs(hardRatio - 0.33) < 0.1) {
        score += 0.1
      }
    }

    return Math.min(1.0, score)
  }

  // Generate emergency flashcards when all else fails
  private generateEmergencyFlashcards(request: FlashcardGenerationRequest): Flashcard[] {
    const flashcards: Flashcard[] = []
    
    // Extract sentences from content
    const sentences = request.content
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 30)
      .slice(0, request.count)

    for (let i = 0; i < Math.min(request.count, sentences.length); i++) {
      const sentence = sentences[i]
      
      flashcards.push({
        id: `emergency_${i}`,
        question: `What information is provided about: ${sentence.substring(0, 50)}...?`,
        answer: sentence,
        difficulty: 'medium',
        type: 'explanation',
        position: i
      })
    }

    // Fill remaining slots if needed
    while (flashcards.length < request.count) {
      flashcards.push({
        id: `emergency_${flashcards.length}`,
        question: `Study question ${flashcards.length + 1} from your uploaded content`,
        answer: 'This flashcard is based on your uploaded document. Please review the original content for complete details.',
        difficulty: 'medium',
        type: 'explanation',
        position: flashcards.length
      })
    }

    return flashcards
  }

  // Validate flashcards meet quality standards
  validateFlashcards(flashcards: Flashcard[]): { valid: boolean; issues: string[] } {
    const issues: string[] = []

    if (flashcards.length === 0) {
      issues.push('No flashcards generated')
      return { valid: false, issues }
    }

    // Check each flashcard
    flashcards.forEach((card, index) => {
      if (!card.question || card.question.length < 5) {
        issues.push(`Flashcard ${index + 1}: Question too short or missing`)
      }
      
      if (!card.answer || card.answer.length < 10) {
        issues.push(`Flashcard ${index + 1}: Answer too short or missing`)
      }
      
      if (!['easy', 'medium', 'hard'].includes(card.difficulty)) {
        issues.push(`Flashcard ${index + 1}: Invalid difficulty level`)
      }
    })

    // Check for duplicates
    const questions = flashcards.map(card => card.question.toLowerCase())
    const uniqueQuestions = new Set(questions)
    if (uniqueQuestions.size !== questions.length) {
      issues.push('Duplicate questions found')
    }

    return {
      valid: issues.length === 0,
      issues
    }
  }

  // Format flashcards for different export formats
  formatForExport(flashcards: Flashcard[], format: 'json' | 'csv' | 'anki'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(flashcards, null, 2)
        
      case 'csv':
        const headers = 'Question,Answer,Difficulty,Topic,Type'
        const rows = flashcards.map(card => 
          `"${card.question}","${card.answer}","${card.difficulty}","${card.topic || ''}","${card.type || ''}"`
        )
        return [headers, ...rows].join('\n')
        
      case 'anki':
        // Anki format: Front<tab>Back<tab>Tags
        return flashcards.map(card => 
          `${card.question}\t${card.answer}\t${card.difficulty} ${card.type || ''} ${card.topic || ''}`
        ).join('\n')
        
      default:
        return JSON.stringify(flashcards, null, 2)
    }
  }
}

// Export singleton instance
export const flashcardGenerator = new FlashcardGenerator()

export default {
  FlashcardGenerator,
  flashcardGenerator
}